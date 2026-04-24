import type { Authenticator } from "@app/lib/auth";
import {
  listMetronomeDraftInvoices,
  reactivateMetronomeContract as reactivateMetronomeContractRaw,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type ContractLifecycleError =
  | { kind: "invalid_state"; message: string }
  | { kind: "upstream_error"; message: string };

/**
 * Schedule the workspace's Metronome contract to end at the current billing
 * period end, and mark the local subscription as canceled so the "ends on X"
 * banner surfaces immediately.
 */
export async function cancelWorkspaceContractAtPeriodEnd(
  auth: Authenticator
): Promise<Result<{ endDate: Date }, ContractLifecycleError>> {
  const subscription = auth.subscription();
  if (!subscription) {
    return new Err({ kind: "invalid_state", message: "No subscription." });
  }
  if (subscription.trialing) {
    return new Err({
      kind: "invalid_state",
      message: "Use cancel_free_trial to cancel a trialing subscription.",
    });
  }

  if (!isSubscriptionMetronomeBilled(subscription)) {
    return new Err({
      kind: "invalid_state",
      message: "Cancel is only supported for Metronome-billed subscriptions.",
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const { metronomeContractId } = subscription;
  const { metronomeCustomerId } = owner;
  if (!metronomeCustomerId) {
    return new Err({
      kind: "invalid_state",
      message: "Cancel is only supported for Metronome-billed subscriptions.",
    });
  }

  const invoicesResult = await listMetronomeDraftInvoices(metronomeCustomerId);
  if (invoicesResult.isErr()) {
    return new Err({
      kind: "upstream_error",
      message: `Failed to fetch Metronome draft invoices: ${invoicesResult.error.message}`,
    });
  }

  const nowMs = Date.now();
  const currentInvoice = invoicesResult.value.find((inv) => {
    if (inv.contract_id !== metronomeContractId) {
      return false;
    }
    if (!inv.start_timestamp || !inv.end_timestamp) {
      return false;
    }
    const startMs = new Date(inv.start_timestamp).getTime();
    const endMs = new Date(inv.end_timestamp).getTime();
    return startMs <= nowMs && nowMs < endMs;
  });

  if (!currentInvoice?.end_timestamp) {
    return new Err({
      kind: "invalid_state",
      message:
        "Could not determine the current billing period end from Metronome.",
    });
  }

  const periodEnd = new Date(currentInvoice.end_timestamp);

  const scheduleResult = await scheduleMetronomeContractEnd({
    metronomeCustomerId,
    contractId: metronomeContractId,
    endingBefore: periodEnd,
  });
  if (scheduleResult.isErr()) {
    return new Err({
      kind: "upstream_error",
      message: `Failed to schedule Metronome contract end: ${scheduleResult.error.message}`,
    });
  }

  const subscriptionResource = auth.getNonNullableSubscriptionResource();
  await subscriptionResource.markAsCanceled({ endDate: periodEnd });

  return new Ok({ endDate: periodEnd });
}

/**
 * Clear the scheduled end on the workspace's Metronome contract and unset the
 * local cancellation markers.
 */
export async function reactivateWorkspaceContract(
  auth: Authenticator
): Promise<Result<void, ContractLifecycleError>> {
  const subscription = auth.subscription();
  if (!subscription) {
    return new Err({ kind: "invalid_state", message: "No subscription." });
  }

  if (!isSubscriptionMetronomeBilled(subscription)) {
    return new Err({
      kind: "invalid_state",
      message:
        "Reactivate is only supported for Metronome-billed subscriptions.",
    });
  }

  const owner = auth.getNonNullableWorkspace();
  const { metronomeContractId } = subscription;
  const { metronomeCustomerId } = owner;
  if (!metronomeCustomerId) {
    return new Err({
      kind: "invalid_state",
      message:
        "Reactivate is only supported for Metronome-billed subscriptions.",
    });
  }

  if (!subscription.endDate && !subscription.requestCancelAt) {
    return new Err({
      kind: "invalid_state",
      message: "The subscription is not scheduled for cancellation.",
    });
  }

  const reactivateResult = await reactivateMetronomeContractRaw({
    metronomeCustomerId,
    contractId: metronomeContractId,
  });
  if (reactivateResult.isErr()) {
    return new Err({
      kind: "upstream_error",
      message: `Failed to reactivate Metronome contract: ${reactivateResult.error.message}`,
    });
  }

  const subscriptionResource = auth.getNonNullableSubscriptionResource();
  await subscriptionResource.markAsCanceled({ endDate: null });

  return new Ok(undefined);
}
