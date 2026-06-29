import type { BillingCycle } from "@app/lib/client/subscription";
import {
  ceilToHourISO,
  createMetronomeContract,
  createMetronomeCustomer,
  editMetronomeContract,
  ensureMetronomeStripeBillingConfig,
  findMetronomeCustomerByAlias,
  floorToHourISO,
  getMetronomeContractById,
  getMetronomeCustomerStripeCustomerId,
  listMetronomeContracts,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import {
  type CachedContract,
  resolveActiveMetronomeIds,
} from "@app/lib/metronome/plan_type";
import {
  remapMembershipSeatTypesForContract,
  syncSeatCount,
} from "@app/lib/metronome/seats";
import type { MetronomeStripeCollectionMethod } from "@app/lib/metronome/types";
import { resolveCurrencyFromStripe } from "@app/lib/plans/billing_currency";
import {
  getStripeCustomer,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { cacheWithRedis } from "@app/lib/utils/cache";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Idempotently ensure a Metronome customer exists for a workspace and that
 * its id is persisted on the workspace row.
 *
 * - If `workspace.metronomeCustomerId` is already set, returns it.
 * - Otherwise looks the customer up on Metronome by ingest alias (workspace
 *   sId), creating it if missing, then writes the id back to the workspace.
 *
 * `stripeCustomerId` is optional — when omitted the Metronome customer is
 * created without a Stripe billing-provider configuration. This is the path
 * used for free-plan workspaces that may later receive credits via Poke
 * before they ever subscribe to a paid plan.
 */
export async function ensureMetronomeCustomerForWorkspace({
  workspace,
  stripeCustomerId,
  stripeCollectionMethod,
}: {
  workspace: LightWorkspaceType;
  stripeCustomerId?: string;
  stripeCollectionMethod?: MetronomeStripeCollectionMethod;
}): Promise<Result<{ metronomeCustomerId: string }, Error>> {
  let metronomeCustomerId: string | null = workspace.metronomeCustomerId;

  if (!metronomeCustomerId) {
    const findResult = await findMetronomeCustomerByAlias(workspace.sId);
    if (findResult.isOk()) {
      metronomeCustomerId = findResult.value;
    }
  }

  if (!metronomeCustomerId) {
    const createResult = await createMetronomeCustomer({
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      stripeCustomerId,
      stripeCollectionMethod,
    });
    if (createResult.isErr()) {
      return new Err(createResult.error);
    }
    metronomeCustomerId = createResult.value.metronomeCustomerId;
  }

  if (workspace.metronomeCustomerId !== metronomeCustomerId) {
    const updateResult = await WorkspaceResource.updateMetronomeCustomerId(
      workspace.id,
      metronomeCustomerId
    );
    if (updateResult.isErr()) {
      return new Err(updateResult.error);
    }
    await WorkspaceResource.invalidateCache(workspace.sId);
  }

  // If a Stripe customer is provided, make sure the Metronome customer has a
  // Stripe billing configuration. This covers the upgrade case where the
  // workspace was provisioned in Metronome without a Stripe link (free plan)
  // and later acquired a Stripe customer.
  if (stripeCustomerId) {
    const billingResult = await ensureMetronomeStripeBillingConfig({
      metronomeCustomerId,
      stripeCustomerId,
      stripeCollectionMethod,
    });
    if (billingResult.isErr()) {
      return new Err(billingResult.error);
    }
  }

  return new Ok({ metronomeCustomerId });
}

/**
 * Resolve the billing currency for a workspace whose Metronome customer
 * already exists. Tries the Stripe subscription first (when the workspace
 * is Stripe-billed); falls back to the Stripe customer that's wired into
 * the Metronome billing configuration (Metronome-only billing path).
 *
 * Returns an error when neither path yields a usable signal — existing
 * customers are expected to have either a Stripe subscription or a linked
 * Stripe billing config on the Metronome customer.
 */
export async function resolveCurrencyForExistingMetronomeCustomer({
  metronomeCustomerId,
  stripeSubscriptionId,
}: {
  metronomeCustomerId: string;
  stripeSubscriptionId: string | null;
}): Promise<Result<SupportedCurrency, Error>> {
  const stripeSubscription = stripeSubscriptionId
    ? await getStripeSubscription(stripeSubscriptionId)
    : null;
  if (stripeSubscription) {
    return new Ok(resolveCurrencyFromStripe({ stripeSubscription }));
  }

  // Metronome-only billing path: no Stripe sub. Read the Stripe customer
  // through the Metronome billing config, then derive currency from its
  // currency / address.country.
  const stripeCustomerIdResult =
    await getMetronomeCustomerStripeCustomerId(metronomeCustomerId);
  if (stripeCustomerIdResult.isErr()) {
    return new Err(
      new Error(
        "Failed to resolve billing currency for Metronome customer " +
          `${metronomeCustomerId}: could not read Stripe billing config: ` +
          stripeCustomerIdResult.error.message
      )
    );
  }

  const stripeCustomerId = stripeCustomerIdResult.value;
  if (!stripeCustomerId) {
    return new Err(
      new Error(
        "Failed to resolve billing currency for Metronome customer " +
          `${metronomeCustomerId}: no Stripe billing config found.`
      )
    );
  }

  const stripeCustomer = await getStripeCustomer(stripeCustomerId);
  if (!stripeCustomer) {
    return new Err(
      new Error(
        "Failed to resolve billing currency for Metronome customer " +
          `${metronomeCustomerId}: Stripe customer ${stripeCustomerId} could ` +
          "not be retrieved."
      )
    );
  }

  return new Ok(resolveCurrencyFromStripe({ stripeCustomer }));
}

/**
 * Provision a Metronome contract on an already-existing Metronome customer.
 * Snaps `startingAt` to an hour boundary, ends any non-archived existing
 * contracts that would overlap the new start (a customer must never have two
 * overlapping active contracts), creates the contract from the given package
 * alias, then syncs seat / MAU subscription quantities seeded by the package.
 *
 * `swapAt` controls how `startingAt` is snapped:
 *  - `"current-hour"` (default): floor — for seat-based plans where the
 *    current partial hour has no usage to attribute. New contract is active
 *    immediately.
 *  - `"next-hour"`: ceil — preserves the current partial hour on whatever
 *    contract was running; required when usage attribution matters.
 *
 * The Metronome customer must already exist (call
 * `ensureMetronomeCustomerForWorkspace` first).
 */
export async function provisionMetronomeContract({
  metronomeCustomerId,
  workspace,
  packageAlias,
  uniquenessKey,
  startingAt,
  swapAt = "current-hour",
  enableStripeBilling = true,
  planCode,
  additionalCustomFields,
  enableSeatSync = true,
  fromContractId,
}: {
  metronomeCustomerId: string;
  workspace: LightWorkspaceType;
  packageAlias: string;
  uniquenessKey?: string;
  startingAt: Date;
  swapAt?: "current-hour" | "next-hour";
  enableStripeBilling?: boolean;
  planCode: string;
  additionalCustomFields?: Record<string, string>;
  enableSeatSync?: boolean;
  fromContractId?: string;
}): Promise<Result<{ metronomeContractId: string }, Error>> {
  const alignedStart = new Date(
    swapAt === "current-hour"
      ? floorToHourISO(startingAt)
      : ceilToHourISO(startingAt)
  );

  logger.info(
    {
      metronomeCustomerId,
      workspaceId: workspace.sId,
      packageAlias,
      enableStripeBilling,
      startingAt: alignedStart.toISOString(),
      swapAt,
    },
    "[Metronome] Provisioning contract"
  );

  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
    uniquenessKey,
    startingAt: alignedStart,
    enableStripeBilling,
    planCode,
    additionalCustomFields,
    fromContractId,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }
  const { contractId: metronomeContractId } = contractResult.value;

  const contractsResult = await listMetronomeContracts(metronomeCustomerId);
  if (contractsResult.isErr()) {
    return new Err(
      new Error(
        `Created new contract ${metronomeContractId} but failed to list ` +
          `existing contracts to sunset: ${contractsResult.error.message}. ` +
          "Manual cleanup may be required."
      )
    );
  }
  const newStartMs = alignedStart.getTime();
  for (const existing of contractsResult.value) {
    if (existing.id === metronomeContractId) {
      continue;
    }
    // The RENEWAL transition already ends the prior contract at `alignedStart`;
    // calling updateEndDate on it again is redundant and Metronome can reject
    // editing a contract that has been transitioned from.
    if (existing.id === fromContractId) {
      continue;
    }
    if (existing.archived_at) {
      continue;
    }
    const existingStartMs = new Date(existing.starting_at).getTime();
    if (existingStartMs > newStartMs) {
      continue;
    }
    const existingEndsBeforeMs = existing.ending_before
      ? new Date(existing.ending_before).getTime()
      : null;
    if (existingEndsBeforeMs !== null && existingEndsBeforeMs <= newStartMs) {
      continue;
    }
    const sunsetResult = await scheduleMetronomeContractEnd({
      metronomeCustomerId,
      contractId: existing.id,
      endingBefore: alignedStart,
    });
    if (sunsetResult.isErr()) {
      return new Err(
        new Error(
          `Created new contract ${metronomeContractId} but failed to ` +
            `sunset existing contract ${existing.id}: ` +
            `${sunsetResult.error.message}. Manual cleanup may be required.`
        )
      );
    }
  }

  if (enableSeatSync) {
    // Remap existing memberships to seat types billed by the new contract BEFORE
    // syncing, so no member lands on a seat type the new contract doesn't bill
    // (which would leave them unbilled). For future-dated switches this schedules
    // the change at the contract start; the sync below then reconciles the new
    // contract against the (current or scheduled) membership seat types.
    const remapResult = await remapMembershipSeatTypesForContract({
      metronomeCustomerId,
      contractId: metronomeContractId,
      workspace,
      swapAt,
      startingAt: alignedStart,
    });
    if (remapResult.isErr()) {
      return new Err(remapResult.error);
    }

    const syncResult = await syncSeatCount({
      metronomeCustomerId,
      contractId: metronomeContractId,
      workspace,
      planCode,
      startingAt: alignedStart.toISOString(),
    });
    if (syncResult.isErr()) {
      return new Err(syncResult.error);
    }
  }

  // Pool credit state reconciliation: handled by the credit.segment.start /
  // commit.segment.start webhooks, which fire on every new contract's
  // recurring credit/commit. We don't call syncPoolCreditStateFromBalance
  // here because lib/metronome is a transport layer and importing the
  // credit_state_dispatcher would create a cycle through auth →
  // subscription_resource → contracts.

  return new Ok({ metronomeContractId });
}

/**
 * Create a Metronome contract for a payment-gated subscription activation without
 * touching any existing active contract.
 *
 * Unlike `provisionMetronomeContract`, this helper does NOT sunset overlapping
 * contracts. The free-plan contract must remain active until payment succeeds;
 * if payment fails, the activation contract is ended and the workspace stays on
 * the free contract. Only the payment success handler should end the previous
 * contract.
 *
 * No seat sync is performed — the checkout contract is a candidate until payment
 * succeeds, at which point `handleSubscriptionActivationSuccess` does the swap
 * and triggers seat sync.
 */
export async function provisionPaymentGatedActivationContract({
  metronomeCustomerId,
  workspace,
  packageAlias,
  uniquenessKey,
  startingAt,
  planCode,
  additionalCustomFields,
}: {
  metronomeCustomerId: string;
  workspace: LightWorkspaceType;
  packageAlias: string;
  uniquenessKey?: string;
  startingAt: Date;
  planCode: string;
  additionalCustomFields?: Record<string, string>;
}): Promise<Result<{ metronomeContractId: string }, Error>> {
  const alignedStart = new Date(floorToHourISO(startingAt));

  logger.info(
    {
      metronomeCustomerId,
      workspaceId: workspace.sId,
      packageAlias,
      startingAt: alignedStart.toISOString(),
    },
    "[Metronome] Provisioning payment-gated activation contract"
  );

  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
    uniquenessKey,
    startingAt: alignedStart,
    enableStripeBilling: true,
    planCode,
    additionalCustomFields,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }
  const { contractId: metronomeContractId } = contractResult.value;

  return new Ok({ metronomeContractId });
}

/**
 * A per-seat FLAT override to apply on a contract. When `entitled` is true (the
 * default) it sets `productId`'s rate to `priceNative` from `startingAt`; when
 * `entitled` is false it disables the seat product (de-entitles it) — used when
 * an operator unchecks a seat the package would otherwise sell. `priceNative` is
 * in Metronome's fiat unit (cents for USD, whole units for EUR) — the same unit
 * the rate card uses, so it is not labelled `Cents` (that would be wrong for
 * EUR); pass 0 when disabling. `billingFrequency` disambiguates the seat
 * product's subscription rate (monthly vs annual seats).
 */
export interface SeatRateOverride {
  productId: string;
  billingFrequency: "MONTHLY" | "ANNUAL";
  priceNative: number;
  creditTypeId: string;
  entitled: boolean;
}

/**
 * Apply FLAT per-seat overrides on a provisioned contract. Seats are provisioned
 * from the package at its default override rate; this overwrites those rates
 * with operator-specified values (e.g. a negotiated seat price), entitles seats
 * the package does not sell by default, or disables seats the operator opted
 * out of — all effective at `startingAt`. No-op when `overrides` is empty.
 */
export async function applySeatRateOverrides({
  metronomeCustomerId,
  contractId,
  startingAt,
  overrides,
}: {
  metronomeCustomerId: string;
  contractId: string;
  startingAt: string;
  overrides: SeatRateOverride[];
}): Promise<Result<void, Error>> {
  if (overrides.length === 0) {
    return new Ok(undefined);
  }
  const editResult = await editMetronomeContract({
    customer_id: metronomeCustomerId,
    contract_id: contractId,
    add_overrides: overrides.map((o) => ({
      starting_at: startingAt,
      type: "OVERWRITE" as const,
      entitled: o.entitled,
      override_specifiers: [
        { product_id: o.productId, billing_frequency: o.billingFrequency },
      ],
      overwrite_rate: {
        rate_type: "FLAT" as const,
        price: o.priceNative,
        credit_type_id: o.creditTypeId,
      },
    })),
  });
  if (editResult.isErr()) {
    return new Err(editResult.error);
  }
  return new Ok(undefined);
}

function billingPeriodFromContract(
  contract: CachedContract
): Result<BillingCycle, Error> {
  const currentPeriod = contract.subscriptions
    ?.map((s) => s.billing_periods?.current)
    .find((bp) => bp !== undefined);

  if (!currentPeriod) {
    return new Err(
      new Error("No current billing period found on Metronome contract")
    );
  }

  return new Ok({
    cycleStart: new Date(currentPeriod.starting_at),
    cycleEnd: new Date(currentPeriod.ending_before),
  });
}

/**
 * Retrieve the current billing period directly from Metronome (no caching).
 *
 * Returns:
 * - Ok(BillingCycle) when the period is found on the contract.
 * - Ok(null) when Metronome is not set up for this workspace (missing IDs).
 * - Err when the Metronome API call fails or no subscription has a billing period.
 */
async function fetchMetronomeCurrentBillingPeriod({
  metronomeContractId,
  metronomeCustomerId,
}: {
  metronomeContractId: string;
  metronomeCustomerId: string;
}): Promise<Result<BillingCycle | null, Error>> {
  const contractResult = await getMetronomeContractById({
    metronomeCustomerId,
    metronomeContractId,
  });

  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  return billingPeriodFromContract(contractResult.value);
}

// Billing periods roll over independently of any contract lifecycle event
// (contract.start/end/edit), so unlike the no-TTL active-contract cache, this
// needs its own short TTL — otherwise a workspace whose contract hasn't been
// edited in a while would keep reading a stale, expired period indefinitely.
const BILLING_PERIOD_CACHE_TTL_MS = 60 * 1000;

async function fetchBillingPeriodRecordForWorkspace(
  workspaceId: string
): Promise<{ cycleStartMs: number; cycleEndMs: number } | null> {
  const ids = await resolveActiveMetronomeIds(workspaceId);
  if (!ids) {
    return null;
  }
  const periodResult = await fetchMetronomeCurrentBillingPeriod(ids);
  if (periodResult.isErr()) {
    throw periodResult.error;
  }
  if (!periodResult.value) {
    return null;
  }
  return {
    cycleStartMs: periodResult.value.cycleStart.getTime(),
    cycleEndMs: periodResult.value.cycleEnd.getTime(),
  };
}

const getCachedBillingPeriodRecordForWorkspace = cacheWithRedis(
  fetchBillingPeriodRecordForWorkspace,
  (workspaceId) => workspaceId,
  { ttlMs: BILLING_PERIOD_CACHE_TTL_MS, cacheNullValues: false }
);

/**
 * Retrieve the current billing period for a workspace's active Metronome contract.
 */
export async function getCachedMetronomeCurrentBillingPeriod(
  workspaceId: string
): Promise<Result<BillingCycle | null, Error>> {
  try {
    const record = await getCachedBillingPeriodRecordForWorkspace(workspaceId);
    if (!record) {
      return new Ok(null);
    }
    return new Ok({
      cycleStart: new Date(record.cycleStartMs),
      cycleEnd: new Date(record.cycleEndMs),
    });
  } catch (err) {
    return new Err(normalizeError(err));
  }
}
