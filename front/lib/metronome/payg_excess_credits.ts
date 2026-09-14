import {
  editMetronomeContract,
  getMetronomeContractById,
  listMetronomeContracts,
} from "@app/lib/metronome/client";
import {
  getCreditTypeAwuId,
  getProductExcessCreditsId,
} from "@app/lib/metronome/constants";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { ContractV2 } from "@metronome/sdk/resources";
import type { ContractEditParams } from "@metronome/sdk/resources/v2/contracts";

// The AWU "Excess Credits" recurring credits on a contract. Legacy
// (programmatic USD) excess recurring credits are excluded by credit type —
// only AWU excess credits are toggled/removed at runtime.
function getAwuExcessRecurringCredits(
  contract: ContractV2
): NonNullable<ContractV2["recurring_credits"]> {
  return (contract.recurring_credits ?? []).filter(
    (rc) =>
      rc.product.id === getProductExcessCreditsId() &&
      rc.access_amount.credit_type_id === getCreditTypeAwuId()
  );
}

/**
 * Set the per-period amount of every AWU recurring "Excess Credits" credit
 * on every active Metronome contract for the workspace to `amount`. The
 * current/future schedule items on each child credit instance are updated
 * to the same value so the change applies in-flight.
 *
 * AWU-only by design: legacy (programmatic USD) contracts are skipped. Only
 * meant to be called on credit-priced plan workspaces. Pass `0` to disable
 * the buffer when PAYG is enabled; pass the package-default amount to
 * restore it when PAYG is turned off.
 */
export async function setAwuContractExcessCreditsAmount({
  metronomeCustomerId,
  workspaceId,
  amount,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  amount: number;
}): Promise<Result<{ updatedContracts: number }, Error>> {
  const now = new Date();

  const contractsResult = await listMetronomeContracts(metronomeCustomerId, {
    coveringDate: now,
  });
  if (contractsResult.isErr()) {
    return new Err(contractsResult.error);
  }

  let updatedContracts = 0;

  for (const summary of contractsResult.value) {
    const detailResult = await getMetronomeContractById({
      metronomeCustomerId,
      metronomeContractId: summary.id,
    });
    if (detailResult.isErr()) {
      return new Err(detailResult.error);
    }
    const contract = detailResult.value;

    const excessRecurringCredits = getAwuExcessRecurringCredits(contract);
    if (excessRecurringCredits.length === 0) {
      continue;
    }

    const excessRecurringCreditIds = new Set(
      excessRecurringCredits.map((rc) => rc.id)
    );

    const updateCredits: NonNullable<ContractEditParams["update_credits"]> = [];
    for (const credit of contract.credits ?? []) {
      if (
        !credit.recurring_credit_id ||
        !excessRecurringCreditIds.has(credit.recurring_credit_id)
      ) {
        continue;
      }

      const activeOrFutureSegments = (
        credit.access_schedule?.schedule_items ?? []
      ).filter(
        (item) => new Date(item.ending_before).getTime() > now.getTime()
      );

      if (activeOrFutureSegments.length === 0) {
        continue;
      }

      updateCredits.push({
        credit_id: credit.id,
        access_schedule: {
          update_schedule_items: activeOrFutureSegments.map((item) => ({
            id: item.id,
            amount,
          })),
        },
      });
    }

    const editResult = await editMetronomeContract({
      customer_id: metronomeCustomerId,
      contract_id: contract.id,
      update_recurring_credits: excessRecurringCredits.map((rc) => ({
        recurring_credit_id: rc.id,
        access_amount: { unit_price: amount, quantity: 1 },
      })),
      ...(updateCredits.length > 0 ? { update_credits: updateCredits } : {}),
    });
    if (editResult.isErr()) {
      return new Err(editResult.error);
    }

    updatedContracts += 1;
    logger.info(
      {
        workspaceId,
        metronomeCustomerId,
        contractId: contract.id,
        recurringCreditIds: excessRecurringCredits.map((rc) => rc.id),
        updatedSegmentCount: updateCredits.reduce(
          (acc, c) =>
            acc + (c.access_schedule?.update_schedule_items?.length ?? 0),
          0
        ),
        amount,
      },
      "[Metronome PAYG] Updated AWU recurring excess credits on contract"
    );
  }

  return new Ok({ updatedContracts });
}

/**
 * Remove the AWU "Excess Credits" buffer from a single freshly-provisioned
 * contract when PAYG is enabled. Metronome bakes the excess recurring credit
 * into the package template and offers no way to delete a recurring credit from
 * a contract, so we neutralize it in place:
 *
 *  - archive every child credit the recurring credit has already spawned that
 *    is still active/future, so no excess buffer credit exists on the contract;
 *  - zero the recurring credit's per-period amount so no later period
 *    regenerates a buffer.
 *
 * The net effect is that a PAYG contract carries no excess buffer, so
 * over-consumption past the free credit pool bills as PAYG from the start
 * instead of being silently absorbed.
 *
 * AWU-only by design (legacy programmatic-USD excess credits are skipped) and a
 * no-op when the contract has no AWU excess recurring credit. Only active/future
 * child credits are archived — a recovered contract could carry expired,
 * already-consumed excess credits that must not be touched.
 */
export async function removeAwuContractExcessCreditsForContract({
  metronomeCustomerId,
  workspaceId,
  metronomeContractId,
}: {
  metronomeCustomerId: string;
  workspaceId: string;
  metronomeContractId: string;
}): Promise<Result<{ archivedCredits: number }, Error>> {
  const now = new Date();

  const detailResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });
  if (detailResult.isErr()) {
    return new Err(detailResult.error);
  }
  const contract = detailResult.value;

  const excessRecurringCredits = getAwuExcessRecurringCredits(contract);
  if (excessRecurringCredits.length === 0) {
    return new Ok({ archivedCredits: 0 });
  }

  const excessRecurringCreditIds = new Set(
    excessRecurringCredits.map((rc) => rc.id)
  );

  const archiveCredits: NonNullable<ContractEditParams["archive_credits"]> = [];
  for (const credit of contract.credits ?? []) {
    if (
      !credit.recurring_credit_id ||
      !excessRecurringCreditIds.has(credit.recurring_credit_id)
    ) {
      continue;
    }

    const hasActiveOrFutureSegment = (
      credit.access_schedule?.schedule_items ?? []
    ).some((item) => new Date(item.ending_before).getTime() > now.getTime());
    if (!hasActiveOrFutureSegment) {
      continue;
    }

    archiveCredits.push({ id: credit.id });
  }

  const editResult = await editMetronomeContract({
    customer_id: metronomeCustomerId,
    contract_id: contract.id,
    update_recurring_credits: excessRecurringCredits.map((rc) => ({
      recurring_credit_id: rc.id,
      access_amount: { unit_price: 0, quantity: 1 },
    })),
    ...(archiveCredits.length > 0 ? { archive_credits: archiveCredits } : {}),
  });
  if (editResult.isErr()) {
    return new Err(editResult.error);
  }

  logger.info(
    {
      workspaceId,
      metronomeCustomerId,
      contractId: contract.id,
      recurringCreditIds: excessRecurringCredits.map((rc) => rc.id),
      archivedCreditCount: archiveCredits.length,
    },
    "[Metronome PAYG] Removed AWU excess credits on provisioned contract"
  );

  return new Ok({ archivedCredits: archiveCredits.length });
}
