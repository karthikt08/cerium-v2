// Phone possession is one signal for billing eligibility, not proof of residency
// or business registration. Billing country is expressly self-attested.
export function normalizeBillingPhone(raw, country) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const value=raw.replace(/[\s().-]/g,'');
  if (country==='IN') return /^\+91[6-9][0-9]{9}$/.test(value)?value:null;
  if (country==='US') return /^\+1[2-9][0-9]{9}$/.test(value)?value:null;
  return null;
}

// Phone prefix routes the account to an edition, while the customer separately
// attests their actual business country. +1 alone cannot distinguish Canada.
export function editionFromPhone(raw) {
  if(normalizeBillingPhone(raw,'IN'))return 'IN';
  if(normalizeBillingPhone(raw,'US'))return 'US';
  return null;
}

export function maskBillingPhone(phone) {
  return phone ? phone.slice(0,phone.startsWith('+91')?3:2)+'••••••'+phone.slice(-3) : '';
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
