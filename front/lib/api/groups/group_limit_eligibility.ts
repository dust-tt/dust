import type { Authenticator } from "@app/lib/auth";
import { getActiveContract } from "@app/lib/metronome/plan_type";
import { contractHasPersonalCreditSeats } from "@app/lib/metronome/seats";
import { isCreditPricedPlan } from "@app/types/plan";

/**
 * @cc [owner:rfrenoy,label:product;security] group-limit-pooled-only
 * Group limits MUST only apply when the `group_limits` flag is on and the workspace is credit-priced
 * on a pool-only contract (no sold seat type carries personal credits). Every group-limit entry point
 * (setting a limit, recording, enforcement, UI data) MUST gate on this function. Group limit values
 * MUST NOT be serialized outside endpoints gated on this function (they are not part of `GroupType`).
 */
export async function areGroupLimitsEnabled(
  auth: Authenticator
): Promise<boolean> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.subscription()?.plan;
  if (
    !owner.metronomeCustomerId ||
    !plan ||
    !isCreditPricedPlan(plan) ||
    !(await auth.hasFeatureFlag("group_limits"))
  ) {
    return false;
  }

  const contract = await getActiveContract(owner.sId);
  if (!contract) {
    return false;
  }

  return !(await contractHasPersonalCreditSeats(contract));
}
