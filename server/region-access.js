// Server-side market gate: never trust country or proxy flags sent by a browser.
// The upstream must see a verified client IP, not a public spoofable forwarding header.
import {isIP} from 'node:net';

const PLANS=Object.freeze({
  US:Object.freeze({country:'US',currency:'USD',monthlyPrice:20,minorUnits:2000}),
  IN:Object.freeze({country:'IN',currency:'INR',monthlyPrice:500,minorUnits:50000}),
});
const CACHE_MS=5*60*1000;
const MAX_CACHE=3000;

export function decideRegion(raw){
  if(!raw||typeof raw!=='object'||raw.error||raw.is_bogon===true||
    !raw.location||typeof raw.location.country_code!=='string'||
    !['is_vpn','is_proxy','is_tor'].every(k=>Object.hasOwn(raw,k)&&raw[k]!==null))
    return {ok:false,status:503,reason:'unverified'};
  // Coverage is imperfect: these mean a provider has identified the exit IP.
  // Never block cloud/hosting/mobile IPs solely from those broader signals.
  if(raw.is_vpn||raw.is_proxy||raw.is_tor)
    return {ok:false,status:403,reason:'anonymous_network'};
  const code=raw.location.country_code.toUpperCase();
  const plan=PLANS[code];
  return plan?{ok:true,...plan}:{ok:false,status:403,reason:'country_unavailable'};
}

export function makeIpApiLookup(key,{fetchImpl=fetch,timeoutMs=2500}={}){
  return async ip=>{
    const result=await fetchImpl('https://api.ipapi.is/',{
      method:'POST',
      headers:{'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({q:ip,key}),
      signal:AbortSignal.timeout(timeoutMs),
    });
    if(!result.ok)throw new Error('GeoIP provider unavailable');
    return result.json();
  };
}

function deny(req,res,decision){
  res.set('Cache-Control','no-store');
  res.set('Vary','Accept');
  const messages={
    anonymous_network:'We detected a VPN, proxy or Tor connection. Disconnect it and refresh. If this is a mistake, contact support.',
    country_unavailable:'CERIUM is currently available only in India and the United States.',
    region_mismatch:'This account uses a different regional billing edition. Your existing records and charges have not changed. Contact support.',
    unverified:'We could not verify your region safely right now. Please try again later.',
  };
  const message=messages[decision.reason]||messages.unverified;
  if(decision.status===503)res.set('Retry-After','60');
  if(req.path.startsWith('/api/'))
    return res.status(decision.status).json({error:decision.reason,message});
  return res.status(decision.status).type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
    <title>CERIUM · Region unavailable</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:620px;margin:12vh auto;padding:20px;color:#19213a}h1{font-size:27px}a{color:#3154c5}</style></head>
    <body><h1>CERIUM is temporarily unavailable</h1><p>${message}</p><p><a href="mailto:cerium.founders@gmail.com">Contact CERIUM support</a></p></body></html>`);
}

export function createRegionGate({config,lookup=makeIpApiLookup(config.geoIpApiKey)}){
  const cache=new Map();
  const exempt=req=>req.path==='/healthz'||req.path==='/webhooks/razorpay'||
    req.path==='/unsubscribe'||req.path==='/auth/logout'||req.path==='/api/logout'||
    req.path==='/privacy.html'||req.path==='/terms.html'||
    req.path==='/api/billing/subscription/cancel'|| // Customers must always be able to cancel.
    (req.path==='/api/me'&&['GET','DELETE'].includes(req.method))||
    (req.path==='/api/me/export'&&req.method==='GET'); // Allow basic account/data rights.

  async function classify(ip){
    const existing=cache.get(ip);
    if(existing&&existing.until>Date.now())return existing.decision;
    if(existing)cache.delete(ip);
    // De-duplicate simultaneous requests from one visitor (HTML + static assets).
    const pending=Promise.resolve().then(()=>lookup(ip)).then(decideRegion)
      .catch(()=>({ok:false,status:503,reason:'unverified'}));
    cache.set(ip,{until:Date.now()+CACHE_MS,decision:pending});
    const decision=await pending;
    if(!decision.ok&&decision.status===503)cache.delete(ip); // Allow retry after upstream failure.
    else cache.set(ip,{until:Date.now()+CACHE_MS,decision});
    if(cache.size>MAX_CACHE)cache.delete(cache.keys().next().value);
    return decision;
  }

  return async function regionGate(req,res,next){
    req.region=null;
    req.regionIssue=null;
    if(exempt(req)||!config.regionEnforced)return next();

    // Existing authenticated workspaces are tied to their stored billing country,
    // not the network currently used to access them. Travel and corporate VPNs
    // must never interrupt legitimate customer operations or cancellation.
    if(req.user&&req.session)return next();

    // Marketing, legal, waitlist, static resources and login remain accessible
    // worldwide. New accounts and billing still require verified launch markets.
    const publicRead=['GET','HEAD'].includes(req.method)&&
      !req.path.startsWith('/api/')&&req.path!=='/auth/google/callback';
    if(publicRead)return next();
    if(req.path.startsWith('/auth/')&&!['/auth/register','/auth/google','/auth/google/callback'].includes(req.path))
      return next();

    const ip=req.ip;
    const decision=isIP(ip)?await classify(ip):{ok:false,status:503,reason:'unverified'};
    if(decision.ok)req.region=decision;
    else req.regionIssue=decision;

    // Price discovery never grants access and should return useful availability
    // information rather than a 403. Existing Google accounts may sign in from
    // anywhere; the callback separately checks region before creating an account.
    if(req.path==='/api/region'||req.path==='/auth/google/callback')return next();
    if(req.path==='/auth/google'&&req.body?.intent!=='join')return next();
    if(!decision.ok)return deny(req,res,decision);
    return next();
  };
}
