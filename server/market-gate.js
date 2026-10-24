import {isIP} from 'node:net';

// Resolve visitor markets on the server. Only trust the socket-derived IP
// (Express req.ip already obeys the explicit trust-proxy configuration).
export function createMarketGate({enabled=false,apiKey='',fetchImpl=fetch,cacheMs=300000}={}){
 const cache=new Map();
 const classify=data=>{
   const country=String(data?.location?.country_code||'').toUpperCase();
   const suspicious=Boolean(data?.is_vpn||data?.is_proxy||data?.is_tor);
   if(suspicious)return {allowed:false,reason:'proxy_detected',country:null};
   if(!['IN','US'].includes(country))return {allowed:false,reason:'region_unavailable',country:null};
   return {allowed:true,reason:null,country,currency:country==='IN'?'INR':'USD',monthlyPrice:country==='IN'?500:20};
 };
 async function lookup(ip){
   if(!isIP(ip)||ip==='127.0.0.1'||ip==='::1'||ip==='0.0.0.0')return {allowed:false,reason:'unknown_location',country:null};
   const previous=cache.get(ip);
   if(previous&&previous.expires>Date.now())return previous.value;
   const url='https://api.ipapi.is/?q='+encodeURIComponent(ip)+'&key='+encodeURIComponent(apiKey);
   let result;
   try{
     const res=await fetchImpl(url,{signal:AbortSignal.timeout(3500),headers:{Accept:'application/json'}});
     if(!res.ok)throw new Error('IP lookup unavailable');
     const data=await res.json();
     if(!data?.location?.country_code)throw new Error('IP lookup did not provide country');
     result=classify(data);
   }catch{result={allowed:false,reason:'location_check_unavailable',country:null};}
   // Avoid caching provider outages for long.
   cache.set(ip,{value:result,expires:Date.now()+(result.reason==='location_check_unavailable'?10000:cacheMs)});
   if(cache.size>2000)cache.delete(cache.keys().next().value);
   return result;
 }
 const middleware=async(req,res,next)=>{
   if(!enabled){
     req.market={allowed:true,reason:null,country:null,currency:null,monthlyPrice:null,developmentBypass:true};
     return next();
   }
   const market=await lookup(req.ip);
   req.market=market;
   if(market.allowed)return next();
   const message=market.reason==='proxy_detected'
     ?'CERIUM cannot verify your region while a VPN or proxy is detected. Turn it off and retry, or contact support if this is incorrect.'
     :market.reason==='region_unavailable'
       ?'CERIUM currently supports India and the United States only.'
       :'CERIUM cannot verify your location right now. Please try again or contact support.';
   res.setHeader('Cache-Control','no-store');
   if(req.path.startsWith('/api/')||req.accepts('html')===false)
     return res.status(market.reason==='location_check_unavailable'?503:403).json({error:market.reason,message});
   return res.status(market.reason==='location_check_unavailable'?503:403).type('html')
     .send('<!doctype html><html lang="en"><meta charset="utf-8"><title>CERIUM access</title><main style="font:16px system-ui;max-width:35rem;margin:12vh auto;padding:1.5rem"><h1>Access unavailable</h1><p>'+message+'</p><p><a href="mailto:cerium.founders@gmail.com">Contact support</a></p></main>');
 };
 return {lookup,middleware,classify};
}
