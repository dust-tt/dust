const CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS = 500;
const CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS_ENTERPRISE = 300;

export function getCreditSpendCheckpointThresholdAwuCredits({
  isEnterprisePlan,
}: {
  isEnterprisePlan: boolean;
}): number {
  return isEnterprisePlan
    ? CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS_ENTERPRISE
    : CREDIT_SPEND_CHECKPOINT_THRESHOLD_AWU_CREDITS;
}
