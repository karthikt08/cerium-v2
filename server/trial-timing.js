// New recurring mandates use a bounded authorization window so their first
// provider-scheduled debit cannot occur before 15 full days of usable access.
// Razorpay's start_at is fixed when creating the subscription; UPI/eMandate
// subscriptions cannot necessarily be rescheduled after authentication.
export const TRIAL_SECONDS = 15 * 24 * 60 * 60;
export const AUTH_WINDOW_SECONDS = 60 * 60;

export function makeTrialSchedule(now = Date.now()) {
  const seconds = Math.ceil(now / 1000);
  return {
    expireBy: seconds + AUTH_WINDOW_SECONDS,
    startAt: seconds + AUTH_WINDOW_SECONDS + TRIAL_SECONDS,
  };
}

export function safeSubscriptionSchedule(provider,savedStartAt){
  const expected = Number(savedStartAt);
  if (!Number.isSafeInteger(expected) || expected <= 0 || !provider) return false;
  // Check the provider's actual schedule, not just the timestamp in SQLite.
  if (Number(provider.start_at) !== expected) return false;
  if (provider.charge_at != null && (!Number.isSafeInteger(Number(provider.charge_at))||Number(provider.charge_at) < expected)) return false;
  return true;
}

export function safeTrialSchedule(provider, savedStartAt, verifiedAt = Date.now()) {
  if(!safeSubscriptionSchedule(provider,savedStartAt))return false;
  const expected=Number(savedStartAt);
  return expected * 1000 >= verifiedAt + TRIAL_SECONDS * 1000;
}
