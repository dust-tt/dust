import config from "@app/lib/api/config";
import { applyContractStartSubscriptionSwap } from "@app/lib/api/metronome/process_webhook";
import { cancelPendingContract } from "@app/lib/api/poke/cancel_pending_contract";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { metronomeAmount } from "@app/lib/metronome/amounts";
import type {
  MetronomePackageSummary,
  PackageSeatConfig,
} from "@app/lib/metronome/client";
import {
  ceilToHourISO,
  editMetronomeContract,
  floorToHourISO,
  listMetronomePackages,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  AWU_PURCHASE_ORDER_ID_CUSTOM_FIELD_KEY,
  CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY,
  CURRENCY_TO_CREDIT_TYPE_ID,
  getCreditTypeAwuId,
  getProductFreeCreditId,
  getProductPlatformFeeId,
  getProductPrepaidCommitId,
  getProductSeatSubscriptionCommitId,
  HUBSPOT_DEAL_ID_CUSTOM_FIELD_KEY,
  LEGACY_CREDIT_MIGRATION_CUSTOM_FIELD_KEY,
  oneYearAfter,
} from "@app/lib/metronome/constants";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import {
  addDuration,
  commitmentAmount,
  commitmentPeriodEnd,
  invoicePeriodWeights,
  maxInvoicePeriods,
  PAYMENT_FREQUENCY_MONTHS,
} from "@app/lib/metronome/seat_commitment";
import {
  remapMembershipSeatTypesForContract,
  syncSeatCount,
} from "@app/lib/metronome/seats";
import type { MetronomePackageTier } from "@app/lib/metronome/types";
import {
  isPaygEligibleTier,
  PAYG_ELIGIBLE_TIERS,
} from "@app/lib/metronome/types";
import { resolveCurrencyFromStripe } from "@app/lib/plans/billing_currency";
import {
  isBusinessPlanPrefix,
  isEnterprisePlanPrefix,
  isProPlanPrefix,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import {
  getStripeCustomer,
  scheduleSubscriptionCancellation,
} from "@app/lib/plans/stripe";
import { CreditUsageConfigurationResource } from "@app/lib/resources/credit_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { isMembershipSeatType } from "@app/types/memberships";
import type { SwitchContractBody } from "@app/types/poke/switch_contract";
import { SwitchContractBodySchema } from "@app/types/poke/switch_contract";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { ContractEditParams } from "@metronome/sdk/resources/v2/contracts";

export type { SwitchContractBody };
export { SwitchContractBodySchema };

export type SwitchContractErrorKind =
  // Bad input or precondition not met — handler should return 400.
  | "invalid_request"
  // Metronome (or other upstream) API failure before any state was changed.
  | "metronome_api_error"
  // Credit configuration update/create failed (pre-provision, clean abort).
  | "credit_config_failed"
  // Contract was provisioned but one or more post-provision steps failed.
  // The contract is live; the operator must address each listed item manually.
  | "provision_inconsistent";

export class SwitchContractError extends Error {
  constructor(
    readonly kind: SwitchContractErrorKind,
    message: string
  ) {
    super(message);
  }
}

type SwitchContractSuccess = {
  metronomeContractId: string;
};

function classifyPlanCode(planCode: string): MetronomePackageTier {
  if (isEnterprisePlanPrefix(planCode)) {
    return "enterprise";
  }
  if (isBusinessPlanPrefix(planCode) || planCode === PRO_PLAN_SEAT_39_CODE) {
    return "business";
  }
  if (isProPlanPrefix(planCode)) {
    return "pro";
  }
  return "free";
}

function validatePlanPackageCompat(
  planCode: string,
  packageTier: MetronomePackageTier
): { ok: true } | { ok: false; message: string } {
  const planTier = classifyPlanCode(planCode);
  if (planTier !== packageTier) {
    return {
      ok: false,
      message:
        `Plan ${planCode} (tier "${planTier}") does not match the selected ` +
        `Metronome package (tier "${packageTier}").`,
    };
  }
  return { ok: true };
}

function buildInvoiceScheduleItems({
  invoiceAmountCents,
  resolvedCurrency,
  alignedStart,
  commitmentEnd,
  paymentSchedule,
  fullInstallmentCents,
  reduceFrontCents,
}: {
  invoiceAmountCents: number;
  resolvedCurrency: SupportedCurrency;
  alignedStart: Date;
  // End of the commitment period. Installments are clamped so none is ever
  // scheduled at or past it (a 3rd monthly invoice on a 6-week contract would
  // never be raised).
  commitmentEnd: Date;
  paymentSchedule: {
    frequency:
      | "one_time"
      | "monthly"
      | "quarterly"
      | "semi_annually"
      | "annually";
    periods?: number;
  };
  // List amount (cents) of one full payment period. When set, each installment
  // bills this full amount and the last takes the remainder — a full month of a
  // yearly seat is its nominal monthly rate (annual / 12), not the prorated
  // total split evenly. When omitted (initial credits, scheduled charges, which
  // have no per-period list rate), the total is split by prorated period weight.
  fullInstallmentCents?: number;
  // Promotional reduction (cents) applied to the installments from the first
  // bill onwards, each floored at 0 and carrying the leftover to the next — so a
  // free leading period zeroes the earliest bills. Defaults to 0.
  reduceFrontCents?: number;
}): { unitPrice: number; quantity: number; timestamp: Date }[] {
  const { frequency } = paymentSchedule;
  const periods =
    frequency === "one_time" || !paymentSchedule.periods
      ? paymentSchedule.periods
      : Math.min(
          paymentSchedule.periods,
          maxInvoicePeriods(alignedStart, commitmentEnd, frequency)
        );
  // Per-installment amounts (cents) and their timestamps, before the reduction.
  const amountsCents: number[] = [];
  const timestamps: Date[] = [];
  if (frequency === "one_time" || !periods || periods <= 1) {
    amountsCents.push(invoiceAmountCents);
    timestamps.push(alignedStart);
  } else {
    const monthsPerPeriod = PAYMENT_FREQUENCY_MONTHS[frequency];
    // With a known per-period list amount, bill it in full each period (clamped
    // to what's left) and put the remainder on the last, so full periods invoice
    // at list price. Otherwise distribute the total by the prorated fraction of
    // each period (whole periods equal, partial last).
    const weights = invoicePeriodWeights(
      alignedStart,
      commitmentEnd,
      frequency,
      periods
    );
    const weightSum = weights.reduce((sum, w) => sum + w, 0);
    let allocatedCents = 0;
    for (let i = 0; i < periods; i++) {
      const amountCents =
        i === periods - 1
          ? invoiceAmountCents - allocatedCents
          : fullInstallmentCents !== undefined
            ? Math.min(
                fullInstallmentCents,
                invoiceAmountCents - allocatedCents
              )
            : Math.round(invoiceAmountCents * (weights[i] / weightSum));
      allocatedCents += amountCents;
      amountsCents.push(amountCents);
      const totalMonths = alignedStart.getUTCMonth() + i * monthsPerPeriod;
      const targetYear =
        alignedStart.getUTCFullYear() + Math.floor(totalMonths / 12);
      const targetMonth = ((totalMonths % 12) + 12) % 12;
      const lastDayOfMonth = new Date(
        Date.UTC(targetYear, targetMonth + 1, 0)
      ).getUTCDate();
      const day =
        i === 0 ? Math.min(alignedStart.getUTCDate(), lastDayOfMonth) : 1;
      timestamps.push(
        new Date(
          Date.UTC(
            targetYear,
            targetMonth,
            day,
            alignedStart.getUTCHours(),
            alignedStart.getUTCMinutes(),
            alignedStart.getUTCSeconds(),
            alignedStart.getUTCMilliseconds()
          )
        )
      );
    }
  }
  // Apply the promotional free-period reduction from the first bill onwards.
  let remainingReduction = reduceFrontCents ?? 0;
  for (let i = 0; i < amountsCents.length && remainingReduction > 0; i++) {
    const applied = Math.min(amountsCents[i], remainingReduction);
    amountsCents[i] -= applied;
    remainingReduction -= applied;
  }
  return amountsCents.map((cents, i) => ({
    unitPrice: metronomeAmount(cents, resolvedCurrency),
    quantity: 1,
    timestamp: timestamps[i],
  }));
}

// ─── Pre-provision helper functions ──────────────────────────────────────────

async function checkEligibility(
  auth: Authenticator
): Promise<Result<void, SwitchContractError>> {
  const currentSubscription = auth.subscriptionResource();
  const isMetronomeOnly = currentSubscription?.isMetronomeOnlyBilled ?? false;
  const billingEnabled = await isMetronomeBillingEnabled(auth);
  if (!isMetronomeOnly && !billingEnabled) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "switch_contract is only available for Metronome-billed workspaces. " +
          "Migrate the workspace to Metronome billing before invoking this flow."
      )
    );
  }
  return new Ok(undefined);
}

async function resolveStripeCustomer(
  stripeCustomerId: string
): Promise<
  Result<{ resolvedCurrency: SupportedCurrency }, SwitchContractError>
> {
  const stripeCustomer = await getStripeCustomer(stripeCustomerId);
  if (!stripeCustomer) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        `Stripe customer not found: ${stripeCustomerId}.`
      )
    );
  }
  return new Ok({
    resolvedCurrency: resolveCurrencyFromStripe({ stripeCustomer }),
  });
}

async function resolveMetronomeCustomer({
  ownerLight,
  stripeCustomerId,
  stripeCollectionMethod,
}: {
  ownerLight: LightWorkspaceType;
  // Empty when the contract is to be created with no Stripe billing
  // provider — passed through as `undefined` so no billing config is set.
  stripeCustomerId: string;
  stripeCollectionMethod: "charge_automatically" | "send_invoice";
}): Promise<Result<{ metronomeCustomerId: string }, SwitchContractError>> {
  const result = await ensureMetronomeCustomerForWorkspace({
    workspace: ownerLight,
    stripeCustomerId: stripeCustomerId || undefined,
    stripeCollectionMethod,
  });
  if (result.isErr()) {
    return new Err(
      new SwitchContractError(
        "metronome_api_error",
        `Failed to ensure Metronome customer: ${result.error.message}`
      )
    );
  }
  return new Ok({ metronomeCustomerId: result.value.metronomeCustomerId });
}

async function resolveAndValidatePackage(
  body: SwitchContractBody,
  // `null` when no Stripe customer is wired in — there's no Stripe currency
  // to match against, so the package's own currency becomes the contract's
  // resolved currency instead of being validated against it.
  resolvedCurrency: SupportedCurrency | null
): Promise<
  Result<
    {
      pkg: MetronomePackageSummary;
      pkgSeatByType: Map<string, PackageSeatConfig>;
      packageAlias: string;
      resolvedCurrency: SupportedCurrency;
    },
    SwitchContractError
  >
> {
  const packagesResult = await listMetronomePackages();
  if (packagesResult.isErr()) {
    return new Err(
      new SwitchContractError(
        "metronome_api_error",
        `Failed to list Metronome packages: ${packagesResult.error.message}`
      )
    );
  }
  const pkg = packagesResult.value.find(
    (p) => p.id === body.metronomePackageId
  );
  if (!pkg) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        `Metronome package not found: ${body.metronomePackageId}`
      )
    );
  }
  if (
    resolvedCurrency !== null &&
    pkg.tier !== "free" &&
    pkg.currency !== resolvedCurrency
  ) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        `Metronome package ${body.metronomePackageId} is ${pkg.currency.toUpperCase()}, ` +
          `but Stripe customer ${body.stripeCustomerId} resolves to ` +
          `${resolvedCurrency.toUpperCase()}. Pick a ${resolvedCurrency.toUpperCase()} package.`
      )
    );
  }
  const compat = validatePlanPackageCompat(body.planCode, pkg.tier);
  if (!compat.ok) {
    return new Err(new SwitchContractError("invalid_request", compat.message));
  }
  if (body.paygEnabled && !isPaygEligibleTier(pkg.tier)) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        `Pay-as-you-go can only be enabled for ${PAYG_ELIGIBLE_TIERS.join(" or ")} contracts.`
      )
    );
  }
  const pkgSeatByType = new Map(pkg.seats.map((s) => [s.seatType, s]));
  for (const [seatType, seat] of Object.entries(body.seats)) {
    if (!isMembershipSeatType(seatType)) {
      continue;
    }
    const pkgSeat = pkgSeatByType.get(seatType);
    if (
      seat.selected &&
      pkgSeat &&
      !pkgSeat.entitled &&
      seatType !== "free" &&
      seat.rate <= 0
    ) {
      return new Err(
        new SwitchContractError(
          "invalid_request",
          `Seat "${seatType}" is not entitled by the selected package and ` +
            "requires a rate greater than 0 to entitle it."
        )
      );
    }
  }
  const packageAlias = pkg.aliases[0];
  if (!packageAlias) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        `Package ${pkg.id} has no alias to switch to.`
      )
    );
  }
  return new Ok({
    pkg,
    pkgSeatByType,
    packageAlias,
    resolvedCurrency: resolvedCurrency ?? pkg.currency,
  });
}

function resolveSwapTiming(
  startingAt: string | undefined
): Result<
  { startingAtDate: Date; swapAt: "current-hour" | "next-hour" },
  SwitchContractError
> {
  if (!startingAt) {
    return new Ok({ startingAtDate: new Date(), swapAt: "current-hour" });
  }
  const requestedStartMs = Date.parse(startingAt);
  if (Number.isNaN(requestedStartMs)) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "startingAt is not a valid ISO timestamp."
      )
    );
  }
  return new Ok({
    startingAtDate: new Date(requestedStartMs),
    swapAt: "next-hour",
  });
}

function resolveContractEndDate(
  endingAt: string | undefined
): Result<Date | undefined, SwitchContractError> {
  if (!endingAt) {
    return new Ok(undefined);
  }
  const requestedEndMs = Date.parse(endingAt);
  if (Number.isNaN(requestedEndMs)) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "endingAt is not a valid ISO timestamp."
      )
    );
  }
  return new Ok(new Date(requestedEndMs));
}

// Persist the per-seat-type billing floors BEFORE provisioning. The
// provisioning sync clamps each seat's quantity up to its configured
// `minSeats`, so the floor must already be in `workspace_seat_limits` when
// that sync runs.
async function persistSeatFloors(
  workspace: LightWorkspaceType,
  body: SwitchContractBody
): Promise<Result<void, SwitchContractError>> {
  for (const [seatType, seat] of Object.entries(body.seats)) {
    if (!isMembershipSeatType(seatType)) {
      continue;
    }
    const maxSeats = seat.maxSeats ?? null;
    if (seat.selected && (seat.minSeats > 0 || maxSeats !== null)) {
      const result = await WorkspaceSeatLimitResource.upsert({
        workspace,
        seatType,
        minSeats: seat.minSeats,
        maxSeats,
      });
      if (result.isErr()) {
        return new Err(
          new SwitchContractError(
            "metronome_api_error",
            `Failed to persist seat floor for "${seatType}": ${result.error.message}`
          )
        );
      }
    } else {
      await WorkspaceSeatLimitResource.remove({
        workspace,
        seatType,
      });
    }
  }
  return new Ok(undefined);
}

// If there's already a pending contract, cancel it before creating a new one.
// Metronome rejects a second transition from a contract that already has a
// RENEWAL successor, so we must archive the pending contract and restore the
// current one first.
async function cancelExistingPendingContract(
  auth: Authenticator,
  workspaceModelId: number
): Promise<Result<void, SwitchContractError>> {
  const existingPending =
    await SubscriptionResource.fetchPendingByWorkspaceModelId(workspaceModelId);
  if (!existingPending) {
    return new Ok(undefined);
  }
  const result = await cancelPendingContract({ auth });
  if (result.isErr()) {
    return new Err(
      new SwitchContractError(
        "metronome_api_error",
        `A pending contract already exists and could not be cancelled before ` +
          `switching: ${result.error.message}`
      )
    );
  }
  return new Ok(undefined);
}

// Ensure the workspace has a WorkOS organization for any paid tier.
async function ensureWorkOSOrg(
  ownerLight: LightWorkspaceType,
  pkgTier: MetronomePackageTier
): Promise<Result<void, SwitchContractError>> {
  if (pkgTier === "free") {
    return new Ok(undefined);
  }
  const result = await getOrCreateWorkOSOrganization(ownerLight);
  if (result.isErr()) {
    return new Err(
      new SwitchContractError(
        "metronome_api_error",
        `Failed to provision WorkOS organization: ${result.error.message}`
      )
    );
  }
  return new Ok(undefined);
}

// Write all credit usage configuration fields before provisioning so a failure
// aborts cleanly without any Metronome state to undo.
async function persistCreditConfig(
  auth: Authenticator,
  creditConfig: CreditUsageConfigurationResource | null,
  body: SwitchContractBody
): Promise<Result<void, SwitchContractError>> {
  const configBlob = {
    defaultDiscountPercent: body.defaultDiscountPercent,
    paygEnabled: body.paygEnabled,
    usageCapCredits: body.usageCapCredits ?? null,
    balanceThresholdAwuCredits: body.balanceThresholdCredits ?? null,
    defaultPoolCapAwuCredits: body.defaultPoolCapCredits ?? 0,
    programmaticMonthlyCapAwuCredits: body.programmaticMonthlyCapCredits ?? 0,
    autoSeatUpgradeEnabled: body.autoSeatUpgradeEnabled,
    topUpEnabled: body.topUpEnabled,
    autoInvoiceFinalizationEnabled: body.autoInvoiceFinalizationEnabled,
  };
  if (creditConfig) {
    const result = await creditConfig.updateConfiguration(auth, configBlob);
    if (result.isErr()) {
      return new Err(
        new SwitchContractError(
          "credit_config_failed",
          `Failed to update credit configuration: ${result.error.message}`
        )
      );
    }
  } else {
    const result = await CreditUsageConfigurationResource.makeNew(
      auth,
      configBlob
    );
    if (result.isErr()) {
      return new Err(
        new SwitchContractError(
          "credit_config_failed",
          `Failed to create credit configuration: ${result.error.message}`
        )
      );
    }
  }
  return new Ok(undefined);
}

// ─── Post-provision step context & step functions ────────────────────────────
//
// After the Metronome contract is provisioned, each step below is best-effort:
// failures are returned as warning strings and collected by the caller;
// they do NOT abort the switch. The operator must address each warning manually.

type PostProvisionCtx = {
  metronomeCustomerId: string;
  metronomeContractId: string;
  alignedStart: Date;
  endingAtDate: Date | undefined;
  ownerLight: LightWorkspaceType;
  workspaceModelId: number;
  workspaceId: string;
  swapAt: "current-hour" | "next-hour";
  resolvedCurrency: SupportedCurrency;
  stripeSubscriptionId: string | null;
  pkg: MetronomePackageSummary;
  pkgSeatByType: Map<string, PackageSeatConfig>;
  // The contract was freshly created (not recovered), so it has no prior seat
  // assignments — the seat sync can skip the per-subscription state reads.
  contractNewlyCreated: boolean;
  body: SwitchContractBody;
};

// Combine net payment terms, initial credits commit, seat commitment commits,
// and seat rate overrides into a single v2.contracts.edit call.
async function stepContractEdits({
  metronomeCustomerId,
  metronomeContractId,
  alignedStart,
  endingAtDate,
  resolvedCurrency,
  pkg,
  pkgSeatByType,
  body,
}: PostProvisionCtx): Promise<string | null> {
  const addCommits: NonNullable<ContractEditParams["add_commits"]> = [];
  const addOverrides: NonNullable<ContractEditParams["add_overrides"]> = [];
  const addRecurringCredits: NonNullable<
    ContractEditParams["add_recurring_credits"]
  > = [];
  const addScheduledCharges: NonNullable<
    ContractEditParams["add_scheduled_charges"]
  > = [];

  // The commitment period bounds every prepaid commit and invoice schedule on
  // this contract: it runs to the contract end, or one year out when the
  // contract is open-ended.
  const commitmentEnd = commitmentPeriodEnd(alignedStart, endingAtDate);

  // Optional recurring free AWU credit pool, granted directly on this
  // contract (not baked into the package) — e.g. the Partner Demo shared
  // monthly pool. Reuses the "Free Credits" FIXED product; won't be
  // misclassified as a legacy free credit by `isMetronomeFreeCredit` since
  // that additionally requires priority 1 and the programmatic-USD credit
  // type.
  if (body.recurringFreeCredit) {
    addRecurringCredits.push({
      product_id: getProductFreeCreditId(),
      access_amount: {
        credit_type_id: getCreditTypeAwuId(),
        unit_price: body.recurringFreeCredit,
        quantity: 1,
      },
      commit_duration: { value: 1, unit: "PERIODS" },
      priority: AWU_PRIORITY_PURCHASED_COMMIT,
      starting_at: floorToHourISO(alignedStart),
      applicable_product_tags: ["usage"],
      recurrence_frequency: "MONTHLY",
      name: `Recurring free credit: ${body.recurringFreeCredit.toLocaleString()} AWU/month`,
    });
  }

  // Initial credits prepaid commit.
  if (body.initialCredits) {
    const invoiceAmountCents = Math.round(
      body.initialCredits.invoiceAmount * 100
    );
    const scheduleItems = buildInvoiceScheduleItems({
      invoiceAmountCents,
      resolvedCurrency,
      alignedStart,
      commitmentEnd,
      paymentSchedule: body.initialCredits.paymentSchedule,
    });
    const initialCreditsEndingBefore = floorToHourISO(
      oneYearAfter(alignedStart)
    );
    addCommits.push({
      product_id: getProductPrepaidCommitId(),
      type: "PREPAID",
      name: `Initial credits: ${body.initialCredits.amountCredits.toLocaleString()} credits`,
      priority: AWU_PRIORITY_PURCHASED_COMMIT,
      applicable_product_tags: ["usage"],
      custom_fields: {
        [CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY]: initialCreditsEndingBefore,
      },
      access_schedule: {
        credit_type_id: getCreditTypeAwuId(),
        schedule_items: [
          {
            amount: body.initialCredits.amountCredits,
            starting_at: floorToHourISO(alignedStart),
            ending_before: initialCreditsEndingBefore,
          },
        ],
      },
      invoice_schedule: {
        credit_type_id: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
        schedule_items: scheduleItems.map((item) => ({
          unit_price: item.unitPrice,
          quantity: item.quantity,
          timestamp: floorToHourISO(item.timestamp),
        })),
      },
    });
  }

  // Scheduled/one-off charge — a pure invoice line item, no credit grant.
  if (body.scheduledCharge) {
    const chargeAmountCents = Math.round(
      body.scheduledCharge.invoiceAmount * 100
    );
    const scheduleItems = buildInvoiceScheduleItems({
      invoiceAmountCents: chargeAmountCents,
      resolvedCurrency,
      alignedStart,
      commitmentEnd,
      paymentSchedule: body.scheduledCharge.paymentSchedule,
    });
    addScheduledCharges.push({
      product_id: getProductPlatformFeeId(),
      name:
        body.scheduledCharge.name ??
        `Platform fee: ${body.scheduledCharge.invoiceAmount.toLocaleString()} ${resolvedCurrency.toUpperCase()}`,
      schedule: {
        credit_type_id: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
        schedule_items: scheduleItems.map((item) => ({
          unit_price: item.unitPrice,
          quantity: item.quantity,
          timestamp: floorToHourISO(item.timestamp),
        })),
      },
    });
  }

  // Seat commitment commits and rate overrides.
  for (const [seatType, seat] of Object.entries(body.seats)) {
    if (!isMembershipSeatType(seatType)) {
      continue;
    }
    const pkgSeat = pkgSeatByType.get(seatType);
    const billingFrequency = seatType.endsWith("_yearly")
      ? "ANNUAL"
      : "MONTHLY";
    const rateNative = metronomeAmount(
      Math.round(seat.rate * 100),
      resolvedCurrency
    );

    if (
      seat.selected &&
      seat.commitmentPrice !== undefined &&
      seat.minSeats > 0 &&
      seat.rate > 0 &&
      pkgSeat
    ) {
      const fiatCreditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency];
      // The grant covers the seat subscription charges over the commitment
      // period, matching Metronome's per-hour proration (see `commitmentAmount`)
      // so it fully offsets them. The customer is invoiced `commitmentPrice`,
      // which the dialog defaults to this same amount.
      const accessAmountNative =
        Math.round(
          commitmentAmount({
            minSeats: seat.minSeats,
            ratePerPeriod: rateNative,
            isAnnual: billingFrequency === "ANNUAL",
            start: alignedStart,
            end: commitmentEnd,
          }) * 100
        ) / 100;
      // A full payment period bills the committed seats at their list rate for
      // that period: the seat's monthly rate (annual / 12 for a yearly seat)
      // times the months per payment period. The last installment takes the
      // prorated remainder.
      const seatMonthlyRate =
        billingFrequency === "ANNUAL" ? seat.rate / 12 : seat.rate;
      const paymentMonths =
        seat.paymentSchedule.frequency === "one_time"
          ? 1
          : PAYMENT_FREQUENCY_MONTHS[seat.paymentSchedule.frequency];
      // Optional promotional free period: reduce the seat's earliest bills by
      // the prorated value of the leading offered duration (never beyond the
      // contract end). The grant is left untouched — this is a pure discount.
      const offerReductionCents = body.offerFreePeriod
        ? Math.round(
            commitmentAmount({
              minSeats: seat.minSeats,
              ratePerPeriod: rateNative,
              isAnnual: billingFrequency === "ANNUAL",
              start: alignedStart,
              end: new Date(
                Math.min(
                  addDuration(
                    alignedStart,
                    body.offerFreePeriod.value,
                    body.offerFreePeriod.unit
                  ).getTime(),
                  commitmentEnd.getTime()
                )
              ),
            }) * 100
          )
        : 0;
      const seatScheduleItems = buildInvoiceScheduleItems({
        invoiceAmountCents: Math.round(seat.commitmentPrice * 100),
        resolvedCurrency,
        alignedStart,
        commitmentEnd,
        paymentSchedule: seat.paymentSchedule,
        fullInstallmentCents: Math.round(
          seat.minSeats * seatMonthlyRate * paymentMonths * 100
        ),
        reduceFrontCents: offerReductionCents,
      });
      addCommits.push({
        product_id: getProductSeatSubscriptionCommitId(),
        type: "PREPAID",
        name: `${pkgSeat.productName} commitment: ${seat.minSeats} seats`,
        priority: AWU_PRIORITY_PURCHASED_COMMIT,
        applicable_product_ids: [pkgSeat.productId],
        access_schedule: {
          credit_type_id: fiatCreditTypeId,
          schedule_items: [
            {
              amount: accessAmountNative,
              starting_at: floorToHourISO(alignedStart),
              ending_before: floorToHourISO(commitmentEnd),
            },
          ],
        },
        invoice_schedule: {
          credit_type_id: fiatCreditTypeId,
          schedule_items: seatScheduleItems.map((item) => ({
            unit_price: item.unitPrice,
            quantity: item.quantity,
            timestamp: floorToHourISO(item.timestamp),
          })),
        },
      });
    }

    const needsEntitle = seat.selected && pkgSeat ? !pkgSeat.entitled : false;
    const rateChanged =
      seat.selected &&
      pkgSeat != null &&
      pkgSeat.entitled &&
      rateNative !== pkgSeat.defaultRate;
    const needsDisable = !seat.selected && pkgSeat != null && pkgSeat.entitled;
    if (pkgSeat && (needsEntitle || rateChanged)) {
      addOverrides.push({
        starting_at: alignedStart.toISOString(),
        type: "OVERWRITE",
        entitled: true,
        override_specifiers: [
          {
            product_id: pkgSeat.productId,
            billing_frequency: billingFrequency,
          },
        ],
        overwrite_rate: {
          rate_type: "FLAT",
          price: rateNative,
          credit_type_id: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
        },
      });
    } else if (pkgSeat && needsDisable) {
      addOverrides.push({
        starting_at: alignedStart.toISOString(),
        type: "OVERWRITE",
        entitled: false,
        override_specifiers: [
          {
            product_id: pkgSeat.productId,
            billing_frequency: billingFrequency,
          },
        ],
        overwrite_rate: {
          rate_type: "FLAT",
          price: 0,
          credit_type_id: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
        },
      });
    }
  }

  const netPaymentTermsDays = body.netPaymentTermsDays;
  if (
    netPaymentTermsDays === undefined &&
    addCommits.length === 0 &&
    addOverrides.length === 0 &&
    addRecurringCredits.length === 0 &&
    addScheduledCharges.length === 0
  ) {
    return null;
  }

  const result = await editMetronomeContract({
    customer_id: metronomeCustomerId,
    contract_id: metronomeContractId,
    ...(netPaymentTermsDays !== undefined
      ? { update_net_payment_terms_days: netPaymentTermsDays }
      : {}),
    ...(addCommits.length > 0 ? { add_commits: addCommits } : {}),
    ...(addOverrides.length > 0 ? { add_overrides: addOverrides } : {}),
    ...(addRecurringCredits.length > 0
      ? { add_recurring_credits: addRecurringCredits }
      : {}),
    ...(addScheduledCharges.length > 0
      ? { add_scheduled_charges: addScheduledCharges }
      : {}),
  });
  if (result.isErr()) {
    return `contract_edits: ${result.error.message}`;
  }
  return null;
}

// Persist the future-state subscription in `created_backend_only`; the
// `contract.start` webhook flips it to `active` (and ends the current one).
// Skip entirely when alignedStart is in the past: Metronome fires contract.start
// immediately for backdated contracts, so the contract.start handler handles the
// swap — there is no window for a pending row to be useful.
async function stepPendingSubscription({
  workspaceModelId,
  metronomeContractId,
  alignedStart,
  body,
}: PostProvisionCtx): Promise<string | null> {
  if (alignedStart.getTime() <= Date.now()) {
    return null;
  }
  try {
    await SubscriptionResource.createPendingMetronomeContract({
      workspaceModelId,
      planCode: body.planCode,
      metronomeContractId,
      startDate: alignedStart,
      hubspotDealId: body.hubspotDealId,
    });
    return null;
  } catch (err) {
    return `pending_subscription: ${normalizeError(err).message}`;
  }
}

// In environments without a Metronome webhook secret configured (e.g. local
// dev), Metronome's `contract.start` event is never delivered, so an
// immediate switch would otherwise leave the workspace with no Subscription
// row at all — not even a pending one, since `stepPendingSubscription` only
// stages one for future-dated starts. Replay the same transition
// synchronously here instead. Production/staging always have the secret
// configured and rely exclusively on the real webhook, since it also covers
// re-deliveries and future-dated activations.
async function stepImmediateSubscriptionSwapWithoutWebhook({
  workspaceId,
  metronomeCustomerId,
  metronomeContractId,
  alignedStart,
}: PostProvisionCtx): Promise<string | null> {
  if (config.getMetronomeWebhookSecret()) {
    return null;
  }
  if (alignedStart.getTime() > Date.now()) {
    return null;
  }
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    return `dev_subscription_swap: workspace ${workspaceId} not found`;
  }
  const result = await applyContractStartSubscriptionSwap({
    workspace,
    contractId: metronomeContractId,
    customerId: metronomeCustomerId,
  });
  if (result.isErr()) {
    return `dev_subscription_swap: ${result.error.message}`;
  }
  return null;
}

// If the workspace is currently Stripe-billed, schedule the Stripe sub to
// cancel at the swap moment so the two rails don't double-bill.
// If the contract was backdated, alignedStart is already in the past and
// Stripe rejects a past cancel_at — use now (+60s) in that case.
async function stepStripeCancellation({
  stripeSubscriptionId,
  alignedStart,
  workspaceId,
  metronomeContractId,
}: PostProvisionCtx): Promise<string | null> {
  if (!stripeSubscriptionId) {
    return null;
  }
  const stripeCancelAt =
    alignedStart.getTime() > Date.now()
      ? alignedStart
      : new Date(Date.now() + 60_000);
  try {
    await scheduleSubscriptionCancellation({
      stripeSubscriptionId,
      cancelAt: stripeCancelAt,
    });
    return null;
  } catch (err) {
    logger.error(
      {
        workspaceId,
        metronomeContractId,
        stripeSubscriptionId,
        err: normalizeError(err),
      },
      "[switch_contract] Failed to schedule Stripe subscription cancellation"
    );
    return (
      `stripe_cancellation: failed to schedule cancellation of ${stripeSubscriptionId} ` +
      `at ${stripeCancelAt.toISOString()} — ${normalizeError(err).message}. ` +
      `URGENT: cancel the Stripe subscription manually to avoid double-billing.`
    );
  }
}

// Remap memberships and sync seat quantities against the final contract state
// (all overrides already applied). This is the single authoritative seat sync
// for switchContract — provisionMetronomeContract runs with enableSeatSync:false
// to avoid an incorrect intermediate remap on package-default entitlements.
async function stepSeatRemap({
  metronomeCustomerId,
  metronomeContractId,
  ownerLight,
  swapAt,
  alignedStart,
  body,
}: PostProvisionCtx): Promise<string | null> {
  const result = await remapMembershipSeatTypesForContract({
    metronomeCustomerId,
    contractId: metronomeContractId,
    workspace: ownerLight,
    swapAt,
    startingAt: alignedStart,
    promoteNoneSeatType: body.promoteNoneSeatsTo,
  });
  if (result.isErr()) {
    return `seat_remap: ${result.error.message}`;
  }
  return null;
}

async function stepSeatSync({
  metronomeCustomerId,
  metronomeContractId,
  ownerLight,
  alignedStart,
  contractNewlyCreated,
  body,
}: PostProvisionCtx): Promise<string | null> {
  const result = await syncSeatCount({
    metronomeCustomerId,
    contractId: metronomeContractId,
    workspace: ownerLight,
    startingAt: alignedStart.toISOString(),
    planCode: body.planCode,
    assumeEmptySeats: contractNewlyCreated,
  });
  if (result.isErr()) {
    return `seat_sync: ${result.error.message}`;
  }
  return null;
}

// Optional fixed contract end date (exclusive) — e.g. a term-limited pilot or
// negotiated agreement. Applied via a dedicated Metronome call
// (`v1.contracts.updateEndDate`) since it isn't part of `v2.contracts.edit`.
async function stepScheduleContractEnd({
  metronomeCustomerId,
  metronomeContractId,
  endingAtDate,
}: PostProvisionCtx): Promise<string | null> {
  if (!endingAtDate) {
    return null;
  }
  const result = await scheduleMetronomeContractEnd({
    metronomeCustomerId,
    contractId: metronomeContractId,
    endingBefore: endingAtDate,
  });
  if (result.isErr()) {
    return `contract_end_date: ${result.error.message}`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provision a Metronome contract for the workspace and align local state
 * (pending subscription, Stripe cancellation schedule, WorkOS org, PAYG
 * configuration, PAYG dispatcher).
 *
 * Pre-provision (must succeed before the contract is created):
 *   - Eligibility, Stripe customer, Metronome customer, package validation
 *   - Seat billing floors, WorkOS org (soft), PAYG config (hard)
 *   - Cancel any existing pending contract
 *
 * Provision: provisionMetronomeContract
 *
 * Post-provision (best-effort — failures collected as warnings):
 *   - Net payment terms, initial credits, pending subscription
 *   - Stripe cancellation schedule, seat configuration, seat remap/sync
 *   - Contract end date
 *
 * Best-effort fire-and-forget (failure logged, never surfaces):
 *   - PAYG state dispatcher
 */
export async function switchContract({
  auth,
  body,
}: {
  auth: Authenticator;
  body: SwitchContractBody;
}): Promise<Result<SwitchContractSuccess, SwitchContractError>> {
  const owner = auth.getNonNullableWorkspace();
  const currentSubscription = auth.subscriptionResource();
  const ownerLight = renderLightWorkspaceType({ workspace: owner });

  // ─── Pre-provision ────────────────────────────────────────────────────────

  const eligibilityResult = await checkEligibility(auth);
  if (eligibilityResult.isErr()) {
    return new Err(eligibilityResult.error);
  }

  const creditConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  const stripeCustomerId = body.stripeCustomerId.trim();
  let stripeResolvedCurrency: SupportedCurrency | null = null;
  if (stripeCustomerId) {
    const stripeResult = await resolveStripeCustomer(stripeCustomerId);
    if (stripeResult.isErr()) {
      return new Err(stripeResult.error);
    }
    stripeResolvedCurrency = stripeResult.value.resolvedCurrency;
  }

  const customerResult = await resolveMetronomeCustomer({
    ownerLight,
    stripeCustomerId,
    stripeCollectionMethod: body.stripeCollectionMethod,
  });
  if (customerResult.isErr()) {
    return new Err(customerResult.error);
  }
  const { metronomeCustomerId } = customerResult.value;

  const packageResult = await resolveAndValidatePackage(
    body,
    stripeResolvedCurrency
  );
  if (packageResult.isErr()) {
    return new Err(packageResult.error);
  }
  const { pkg, pkgSeatByType, packageAlias, resolvedCurrency } =
    packageResult.value;

  const timingResult = resolveSwapTiming(body.startingAt);
  if (timingResult.isErr()) {
    return new Err(timingResult.error);
  }
  const { startingAtDate, swapAt } = timingResult.value;

  const endDateResult = resolveContractEndDate(body.endingAt);
  if (endDateResult.isErr()) {
    return new Err(endDateResult.error);
  }
  const endingAtDate = endDateResult.value;

  const workosResult = await ensureWorkOSOrg(ownerLight, pkg.tier);
  if (workosResult.isErr()) {
    return new Err(workosResult.error);
  }

  const seatFloorsResult = await persistSeatFloors(ownerLight, body);
  if (seatFloorsResult.isErr()) {
    return new Err(seatFloorsResult.error);
  }

  const creditsConfigResult = await persistCreditConfig(
    auth,
    creditConfig,
    body
  );
  if (creditsConfigResult.isErr()) {
    return new Err(creditsConfigResult.error);
  }

  const cancelResult = await cancelExistingPendingContract(auth, owner.id);
  if (cancelResult.isErr()) {
    return new Err(cancelResult.error);
  }

  logger.info(
    { workspaceId: owner.sId, body },
    "[switch_contract] Provisioning contract with parameters"
  );

  // ─── Provision ────────────────────────────────────────────────────────────
  // Disable the internal seat sync — switchContract always runs its own
  // remap + sync at the end (after seat-rate overrides), so the contract sees
  // the final effective entitlements.
  const additionalCustomFields: Record<string, string> = {};
  if (body.hubspotDealId) {
    additionalCustomFields[HUBSPOT_DEAL_ID_CUSTOM_FIELD_KEY] =
      body.hubspotDealId;
  }
  if (body.purchaseOrderId) {
    additionalCustomFields[AWU_PURCHASE_ORDER_ID_CUSTOM_FIELD_KEY] =
      body.purchaseOrderId;
  }
  if (body.legacyMigrationFreeAwuCreditsPerUser !== undefined) {
    additionalCustomFields[LEGACY_CREDIT_MIGRATION_CUSTOM_FIELD_KEY] = String(
      body.legacyMigrationFreeAwuCreditsPerUser
    );
  }

  const provisionResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: ownerLight,
    packageAlias,
    startingAt: startingAtDate,
    swapAt,
    enableStripeBilling: Boolean(stripeCustomerId),
    planCode: body.planCode,
    fromContractId: currentSubscription?.metronomeContractId ?? undefined,
    enableSeatSync: false,
    additionalCustomFields:
      Object.keys(additionalCustomFields).length > 0
        ? additionalCustomFields
        : undefined,
  });
  if (provisionResult.isErr()) {
    return new Err(
      new SwitchContractError(
        "metronome_api_error",
        `Failed to provision Metronome contract: ${provisionResult.error.message}`
      )
    );
  }
  const { metronomeContractId, recovered } = provisionResult.value;

  const alignedStart = new Date(
    swapAt === "current-hour"
      ? floorToHourISO(startingAtDate)
      : ceilToHourISO(startingAtDate)
  );

  // ─── Build context and run post-provision steps ───────────────────────────

  const ctx: PostProvisionCtx = {
    metronomeCustomerId,
    metronomeContractId,
    alignedStart,
    endingAtDate,
    ownerLight,
    workspaceModelId: owner.id,
    workspaceId: owner.sId,
    swapAt,
    resolvedCurrency,
    stripeSubscriptionId: currentSubscription?.stripeSubscriptionId ?? null,
    pkg,
    pkgSeatByType,
    contractNewlyCreated: !recovered,
    body,
  };

  const warnings: string[] = [];
  const warn = (w: string | null): void => {
    if (w) {
      warnings.push(w);
    }
  };

  warn(await stepContractEdits(ctx));
  warn(await stepSeatRemap(ctx));
  warn(await stepSeatSync(ctx));
  warn(await stepPendingSubscription(ctx));
  warn(await stepImmediateSubscriptionSwapWithoutWebhook(ctx));
  warn(await stepStripeCancellation(ctx));
  warn(await stepScheduleContractEnd(ctx));

  if (warnings.length > 0) {
    return new Err(
      new SwitchContractError(
        "provision_inconsistent",
        `Contract ${metronomeContractId} was provisioned but some post-provision ` +
          `steps failed and require manual attention:\n` +
          warnings.map((w) => `  • ${w}`).join("\n")
      )
    );
  }

  return new Ok({ metronomeContractId });
}
