// Phone possession is one signal for billing eligibility, not proof of residency
// or business registration. Billing country is expressly self-attested.
import {parsePhoneNumberFromString} from 'libphonenumber-js/max';
import {validCountry,COUNTRY_CALLING_CODES} from '../public/js/countries.js';

export function normalizeBillingPhone(raw, country) {
  if (typeof raw !== 'string' || raw.length > 40 || !validCountry(country)) return null;
  // A selected country supplies the dial code for national-format numbers.
  // Never extract a phone from arbitrary text or silently discard an extension.
  const parsed=parsePhoneNumberFromString(raw,{defaultCountry:country,extract:false});
  if(!parsed||parsed.ext||!parsed.isValid()||!/^\+[1-9]\d{6,14}$/.test(parsed.number))return null;
  // Shared plans (+1, +44, +358...) cover several countries/territories and
  // some mobile ranges have no unique region. Keep the explicit declaration,
  // require its calling code, and never infer "United States" from +1 alone.
  if(parsed.countryCallingCode!==COUNTRY_CALLING_CODES[country])return null;
  return parsed.number;
}

export function maskBillingPhone(phone) {
  if(!phone)return '';
  const parsed=parsePhoneNumberFromString(phone);
  return (parsed?'+'+parsed.countryCallingCode:'+')+'••••••'+phone.slice(-3);
}

// Twilio Verify maintains the one-time code; CERIUM never stores OTP plaintext.
// Local development uses a fixed code and sends no SMS; production cannot use it.
export function makePhoneVerifier(config, fetchImpl=fetch) {
  const local=config.phoneVerifyMode==='development' && !config.isProd
    && ['127.0.0.1','localhost','::1'].includes(new URL(config.baseUrl).hostname);
  const twilio=config.phoneVerifyMode==='twilio' && config.phoneVerifyConfigured;
  if (!local&&!twilio) return {ready:false,mode:'unavailable'};
  if(local) return {
    ready:true,mode:'development',
    async send(){return true;},
    async check(phone,code){return code==='000000';}
  };
  const base='https://verify.twilio.com/v2/Services/'+encodeURIComponent(config.twilioVerifyServiceSid);
  const auth='Basic '+Buffer.from(config.twilioAccountSid+':'+config.twilioAuthToken).toString('base64');
  async function request(endpoint, params) {
    const response=await fetchImpl(base+'/'+endpoint,{
      method:'POST',
      headers:{Authorization:auth,'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams(params).toString(),
      signal:AbortSignal.timeout(10000)
    });
    if(!response.ok)throw new Error('Verification provider rejected request');
    return response.json();
  }
  return {
    ready:true,mode:'twilio',
    async send(phone){
      const result=await request('Verifications',{To:phone,Channel:'sms'});
      return ['pending','approved'].includes(result.status);
    },
    async check(phone,code){
      const result=await request('VerificationCheck',{To:phone,Code:code});
      return result.status==='approved';
    }
  };
}
