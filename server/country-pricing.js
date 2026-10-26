import {billingPlan} from '../public/js/countries.js';

export const BILLING_CYCLES=Object.freeze(['monthly','annual']);
export const validBillingCycle=value=>BILLING_CYCLES.includes(value);

// Exactly one month free: annual charge = eleven times the same country-tier
// monthly price. Previously authorized yearly charges remain unchanged. Provider plans must be created separately for each currency/tier.
export function checkoutPlan(config,country,billingCycle='monthly'){
  const price=billingPlan(country);
  if(!price||!validBillingCycle(billingCycle))return null;
  const planId=billingCycle==='annual'
    ?(price.tier==='india'?config.razorpayAnnualIndiaPlanId:
       ({upperMiddle:config.razorpayAnnualUpperMiddlePlanId,lowerMiddle:config.razorpayAnnualLowerMiddlePlanId,low:config.razorpayAnnualLowPlanId}[price.tier]||
        (['high','unclassified'].includes(price.tier)?config.razorpayAnnualPlanId:'')))
    :(price.tier==='india'?config.razorpayIndiaPlanId:
       ({upperMiddle:config.razorpayUpperMiddlePlanId,lowerMiddle:config.razorpayLowerMiddlePlanId,low:config.razorpayLowPlanId}[price.tier]||
        (['high','unclassified'].includes(price.tier)?config.razorpayPlanId:'')));
  const configured=Boolean(config.razorpayConfigured&&/^plan_[A-Za-z0-9]+$/.test(planId||'')&&config.webhookConfigured);
  return {...price,billingCycle,minorUnits:price.minorUnits*(billingCycle==='annual'?11:1),
    annualPrice:price.monthlyPrice*11,planId,configured};
}

// A signed authorization is a price agreement. Annual country-data updates and
// code deployments must never silently rewrite an existing mandate.
export function subscriptionPrice(country,subscription){
  const price=billingPlan(country);
  if(!price)return null;
  if(subscription&&!['cancelled','expired'].includes(subscription.status)&&Number(subscription.price_amount)>0){
    const billingCycle=subscription.billing_cycle==='annual'?'annual':'monthly';
    const agreed=Number(subscription.price_amount);
    const currency=subscription.price_currency;
    const monthlyEquivalent=billingCycle==='annual'?agreed/1200:agreed/100;
    return {...price,billingCycle,minorUnits:agreed,monthlyPrice:monthlyEquivalent,
      annualPrice:billingCycle==='annual'?agreed/100:null,
      currency,tier:subscription.price_tier||'legacy',version:subscription.price_version||'legacy',
      discountPercent:currency==='USD'?(billingCycle==='annual'
        ?price.discountPercent:100-agreed/20):null};
  }
  return {...price,billingCycle:'monthly',annualPrice:price.monthlyPrice*11};
}

export function checkoutAvailable(config,country,subscription,billingCycle='monthly'){
  if(!validBillingCycle(billingCycle))return false;
  if(subscription&&!['cancelled','expired'].includes(subscription.status)&&Number(subscription.price_amount)>0)
    return billingCycle===(subscription.billing_cycle==='annual'?'annual':'monthly')
      &&Boolean(config.razorpayConfigured&&config.webhookConfigured);
  return Boolean(checkoutPlan(config,country,billingCycle)?.configured);
}
