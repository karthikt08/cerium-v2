import {billingPlan} from '../public/js/countries.js';

export function checkoutPlan(config,country){
  const price=billingPlan(country);
  if(!price)return null;
  const planId=price.tier==='india'?config.razorpayIndiaPlanId:
    ({upperMiddle:config.razorpayUpperMiddlePlanId,lowerMiddle:config.razorpayLowerMiddlePlanId,low:config.razorpayLowPlanId}[price.tier]||
      (['high','unclassified'].includes(price.tier)?config.razorpayPlanId:''));
  const configured=Boolean(config.razorpayConfigured&&/^plan_[A-Za-z0-9]+$/.test(planId||'')&&config.webhookConfigured);
  return {...price,planId,configured};
}

// A signed authorization is a price agreement. Annual country-data updates and
// code deployments must never silently rewrite an existing mandate.
export function subscriptionPrice(country,subscription){
  const price=billingPlan(country);
  if(!price)return null;
  if(subscription&&!['cancelled','expired'].includes(subscription.status)&&Number(subscription.price_amount)>0){
    return {...price,minorUnits:Number(subscription.price_amount),monthlyPrice:Number(subscription.price_amount)/100,
      currency:subscription.price_currency,tier:subscription.price_tier||'legacy',version:subscription.price_version||'legacy',
      discountPercent:subscription.price_currency==='USD'?100-Number(subscription.price_amount)/20:null};
  }
  return price;
}
