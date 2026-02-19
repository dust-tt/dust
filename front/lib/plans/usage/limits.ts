import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";

/**
 * Computes the effective message limit for a workspace based on plan and active seats.
 *
 * For free trial phone plans: first seat gets full limit, additional seats get half.
 * Formula: maxMessages * (activeSeats + 1) / 2
 * Example with maxMessages=100: 1 seat=100, 2 seats=150, 3 seats=200, etc.
 *
 * For other plans: linear scaling (maxMessages * activeSeats).
 */
export function computeEffectiveMessageLimit({
  planCode,
  maxMessages,
  activeSeats,
}: {
  planCode: string;
  maxMessages: number;
  activeSeats: number;
}): number {
  if (isFreeTrialPhonePlan(planCode)) {
    return Math.ceil((maxMessages * (activeSeats + 1)) / 2);
  }
  return maxMessages * activeSeats;
}
