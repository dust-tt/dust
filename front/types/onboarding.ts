// User metadata key marking that the profile onboarding form (name, job type,
// favorite platforms) hasn't been completed yet. Set (to "true") at the user's
// first login and cleared when they submit the profile form — either on the
// /welcome page or in the in-app onboarding dialog shown in the credit-priced
// checkout flow.
export const ONBOARDING_PROFILE_PENDING_METADATA_KEY =
  "onboarding:profile_pending";
