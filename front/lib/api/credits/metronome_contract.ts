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
import { isSeatBased } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

export type MetronomeContractSummary = {
  planFamily: "pro" | "enterprise";
  /**
   * MAU tier boundaries parsed from the MAU_TIERS contract custom field.
   * `null` for simple MAU (no tiering) or non-enterprise.
   * Each tier has `start` (inclusive, 1-indexed) and `end` (exclusive, null = unlimited).
   */
  mauTiers: Array<{ start: number; end: number | null }> | null;
  /** ms epoch — set when the contract is scheduled to end (cancellation or fixed term). */
  contractEndingAtMs: number | null;
  /** True if the contract has at least one seat-billed subscription */
  hasSeatSubscription: boolean;
  /**
   * True if the contract sells at least one seat type that carries a personal
   * (per-user) credit allocation — pro/max/free seats. Such users spend their
   * personal credits before falling back to the shared workspace pool, so they
   * keep working even when the pool is depleted/in overage. False for
   * pool-based contracts (workspace seats only) and MAU contracts.
   */
  hasPersonalCreditSeats: boolean;
};

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

  const productSeatTypes = await getProductSeatTypes();
  const soldSeatTypes = getSeatSubscriptionsFromContract(
    contract,
    productSeatTypes
  );
  const hasPersonalCreditSeats = [...soldSeatTypes.keys()].some(isSeatBased);

  return new Ok({
    planFamily,
    mauTiers,
    contractEndingAtMs,
    hasSeatSubscription: await hasContractSeatSubscription(contract),
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
