import type { Authenticator } from "@app/lib/auth";
import { getMetronomeContractById } from "@app/lib/metronome/client";
import type { ContractLifecycleError } from "@app/lib/metronome/contract_lifecycle";
import {
  cancelWorkspaceContractAtPeriodEnd,
  reactivateWorkspaceContract,
} from "@app/lib/metronome/contract_lifecycle";
import { parseMauTiers } from "@app/lib/metronome/mau_sync";
import {
  getProductSeatTypes,
  getSeatSubscriptionsFromContract,
} from "@app/lib/metronome/seat_types";
import { hasContractSeatSubscription } from "@app/lib/metronome/seats";
import { isEnterprisePlanPrefix } from "@app/lib/plans/plan_codes";
import type { MetronomeContractSummary } from "@app/types/api/credits/metronome_contract";
import { isSeatBased } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Fetch the workspace's Metronome contract summary.
 *
 * Returns `Ok(null)` when the workspace has no Metronome contract data to
 * surface (no subscription, no workspace, or no Metronome IDs). Returns `Err`
 * only when the Metronome API call itself fails.
 */
export async function getMetronomeContractSummary(
  auth: Authenticator
): Promise<Result<MetronomeContractSummary | null, Error>> {
  const subscription = auth.subscription();
  const owner = auth.workspace();
  if (!subscription || !owner) {
    return new Ok(null);
  }

  const { metronomeContractId } = subscription;
  const { metronomeCustomerId } = owner;
  if (!metronomeContractId || !metronomeCustomerId) {
    return new Ok(null);
  }

  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const contract = contractResult.value;

  const planFamily: "pro" | "enterprise" = isEnterprisePlanPrefix(
    subscription.plan.code
  )
    ? "enterprise"
    : "pro";

  const mauTiersField = contract.custom_fields?.MAU_TIERS;
  const parsed = parseMauTiers(mauTiersField);
  const mauTiers = parsed
    ? parsed.map((t) => ({ start: t.start, end: t.end ?? null }))
    : null;

  const contractEndingAtMs = contract.ending_before
    ? new Date(contract.ending_before).getTime()
    : null;

  // `hasContractSeatSubscription` short-circuits on MAU/seat-less contracts
  // before touching the product map; only resolve seat types (and the cached
  // product map) when the contract actually sells seats.
  const hasSeatSubscription = await hasContractSeatSubscription(contract);
  let hasPersonalCreditSeats = false;
  if (hasSeatSubscription) {
    const productSeatTypes = await getProductSeatTypes();
    const soldSeatTypes = getSeatSubscriptionsFromContract(
      contract,
      productSeatTypes
    );
    hasPersonalCreditSeats = [...soldSeatTypes.keys()].some(isSeatBased);
  }

  return new Ok({
    planFamily,
    mauTiers,
    contractEndingAtMs,
    hasSeatSubscription,
    hasPersonalCreditSeats,
  });
}

export type ContractLifecycleAction = "cancel" | "reactivate";

export async function applyContractLifecycleAction(
  auth: Authenticator,
  action: ContractLifecycleAction
): Promise<Result<void, ContractLifecycleError>> {
  switch (action) {
    case "cancel": {
      const r = await cancelWorkspaceContractAtPeriodEnd(auth);
      return r.isErr() ? new Err(r.error) : new Ok(undefined);
    }
    case "reactivate":
      return reactivateWorkspaceContract(auth);
    default:
      assertNever(action);
  }
}
