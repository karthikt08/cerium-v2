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
  const exempt=path=>path==='/healthz'||path==='/webhooks/razorpay'||
    path==='/unsubscribe'||path==='/auth/logout'||
    path==='/api/billing/subscription/cancel'; // Always permit cancelling auto-renewal.

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
    if(exempt(req.path))return next();
    if(!config.regionEnforced){
      req.region=null;
      return next();
    }
    const ip=req.ip;
    if(!isIP(ip))return deny(req,res,{status:503,reason:'unverified'});
    const decision=await classify(ip);
    if(!decision.ok)return deny(req,res,decision);
    req.region=decision;
    // No silent country/currency switch for an existing subscription or ledger.
    // Existing cross-region accounts receive a support path instead of a reprice.
    if(req.user&&((req.user.country||'US')!==decision.country||
       (req.user.currency||'USD')!==decision.currency))
      return deny(req,res,{status:409,reason:'region_mismatch'});
    return next();
  };
}
