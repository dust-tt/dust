import { cancelPendingContract } from "@app/lib/api/poke/cancel_pending_contract";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { metronomeAmount } from "@app/lib/metronome/amounts";
import {
  ceilToHourISO,
  editMetronomeContract,
  floorToHourISO,
  listMetronomePackages,
  type MetronomePackageSummary,
  type PackageSeatConfig,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  CARRY_ON_RENEWAL_CUSTOM_FIELD_KEY,
  CURRENCY_TO_CREDIT_TYPE_ID,
  getCreditTypeAwuId,
  getProductPrepaidCommitId,
  getProductSeatSubscriptionCommitId,
  HUBSPOT_DEAL_ID_CUSTOM_FIELD_KEY,
  oneYearAfter,
} from "@app/lib/metronome/constants";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
} from "@app/lib/metronome/contracts";
import {
  remapMembershipSeatTypesForContract,
  syncSeatCount,
} from "@app/lib/metronome/seats";
import {
  isPaygEligibleTier,
  type MetronomePackageTier,
  PAYG_ELIGIBLE_TIERS,
} from "@app/lib/metronome/types";
import { resolveCurrencyFromStripe } from "@app/lib/plans/billing_currency";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
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
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { isMembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { ContractEditParams } from "@metronome/sdk/resources/v2/contracts";
import { z } from "zod";

const paymentScheduleSchema = z
  .object({
    frequency: z
      .enum(["one_time", "monthly", "quarterly", "semi_annually", "annually"])
      .default("one_time"),
    periods: z.number().int().min(2).max(60).optional(),
  })
  .refine(
    (s) => s.frequency === "one_time" || s.periods !== undefined,
    "periods is required when frequency is not one_time"
  )
  .default({ frequency: "one_time" });

export const SwitchContractBodySchema = z.object({
  planCode: z.string().min(1),
  metronomePackageId: z.string().min(1),
  // ISO timestamp. Used only for enterprise-tier switches; any moment is
  // accepted (including the past — backdating is allowed), and it is ceiled to
  // the next hour boundary. Omitted for Pro/Business/Free, which swap at the
  // current hour.
  startingAt: z.string().optional(),
  // Optional. Net payment terms in days (e.g. 30 for "Net 30"): how many days
  // after invoice issuance the invoice is due. Applied to the Metronome
  // contract and only meaningful with `send_invoice`; ignored when the card on
  // file is auto-charged. Omitted leaves Metronome's account default in place.
  netPaymentTermsDays: z.number().int().min(0).max(365).optional(),
  // Optional: required for paid tiers (pro/business/enterprise), omitted
  // for free-tier switches where Metronome contracts have no Stripe link.
  stripeCustomerId: z.string().min(1).optional(),
  // How Metronome collects Stripe invoices for this customer. Only takes
  // effect when a Stripe customer is wired in. `charge_automatically` charges
  // the card on file; `send_invoice` emails the invoice for manual payment.
  stripeCollectionMethod: z
    .enum(["charge_automatically", "send_invoice"])
    .default("charge_automatically"),
  paygEnabled: z.boolean().default(false),
  // AWU credits — written directly to `credit_usage_configuration.usageCapCredits`.
  usageCapCredits: z
    .number()
    .int("Usage cap must be an integer number of credits")
    .min(1, "Usage cap must be at least 1 credit")
    .optional(),
  // Optional one-off initial AWU credits granted alongside the switch as a
  // contract-level prepaid commit (priority 300, same as purchased commits).
  // Requires a Stripe customer so the commit can be invoiced. `invoiceAmount`
  // is in the customer's billing currency major units (e.g. dollars / euros).
  initialCredits: z
    .object({
      amountCredits: z
        .number()
        .int("Initial credits must be an integer number of credits")
        .min(1, "Initial credits must be at least 1 credit"),
      invoiceAmount: z.number().min(0, "Invoice amount must be zero or more"),
      paymentSchedule: paymentScheduleSchema,
    })
    .optional(),
  // Optional per-seat-type settings for the new contract. `minSeats` is the
  // billing floor persisted to `workspace_seat_limits`. `rate` is the per-seat
  // rate in the currency's MAJOR units (dollars / euros), prefilled from the
  // package override; the server converts it to Metronome's fiat unit (cents
  // for USD, whole units for EUR) via `metronomeAmount`. When `commitmentPrice`
  // is set (also in major units), a contract prepaid commit is created granting
  // `minSeats * rate` of contract credit, invoiced at `commitmentPrice` —
  // letting the customer prepay the seat commitment at a negotiated (lower)
  // price. Unknown seat-type keys are ignored.
  // Optional HubSpot deal ID. Stored on the subscription and forwarded to
  // Metronome as a custom field so contracts can be joined back to HubSpot deals
  // for ARR reporting.
  hubspotDealId: z.string().optional(),
  seats: z
    .array(
      z.object({
        seatType: z.string(),
        // Whether the seat is entitled on the new contract. `true` (the default,
        // for backward compatibility) entitles and configures the seat; `false`
        // disables a seat the package would otherwise sell. The dialog submits
        // every known seat so deselections can be turned into disable overrides.
        selected: z.boolean().default(true),
        minSeats: z.number().int().min(0, "Min seats must be ≥ 0"),
        rate: z.number().min(0, "Rate must be ≥ 0"),
        commitmentPrice: z
          .number()
          .min(0, "Commitment price must be ≥ 0")
          .optional(),
        paymentSchedule: paymentScheduleSchema,
      })
    )
    .optional(),
  // Credit usage configuration — written to credit_usage_configuration before
  // provisioning so a failure aborts cleanly.
  defaultDiscountPercent: z.number().int().min(0).max(100).default(0),
  balanceThresholdCredits: z.number().int().min(0).optional(),
  defaultPoolCapCredits: z.number().int().min(0).optional(),
  programmaticMonthlyCapCredits: z.number().int().min(0).optional(),
  autoSeatUpgradeEnabled: z.boolean().default(false),
  topUpEnabled: z.boolean().default(false),
  autoInvoiceFinalizationEnabled: z.boolean().default(true),
});

export type SwitchContractBody = z.infer<typeof SwitchContractBodySchema>;

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

export type SwitchContractSuccess = {
  metronomeContractId: string;
};

function classifyPlanCode(planCode: string): MetronomePackageTier {
  if (isEnterprisePlanPrefix(planCode)) {
    return "enterprise";
  }
  if (
    planCode === CREDIT_PRICED_BUSINESS_PLAN_CODE ||
    planCode === PRO_PLAN_SEAT_39_CODE
  ) {
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

/**
 * First-period seat commitment bounds.
 *
 * - `contract_start_date` anchor: billing periods run from the contract start,
 *   so the first period is always full. Returns fraction=1 and periodEnd one
 *   period after `startingAt`.
 * - `first_billing_period` anchor: billing periods align to calendar month
 *   boundaries (1st → 1st). The first period is a partial stub from contract
 *   start to the next 1st-of-month. Returns the remaining fraction and the
 *   next 1st-of-month as periodEnd.
 */
function firstPeriodCommitment(
  startingAt: Date,
  frequency: "MONTHLY" | "ANNUAL",
  billingAnchor: "contract_start_date" | "first_billing_period"
): { fraction: number; periodEnd: Date } {
  const year = startingAt.getUTCFullYear();
  const month = startingAt.getUTCMonth();
  if (billingAnchor === "contract_start_date") {
    const hh = startingAt.getUTCHours();
    const mm = startingAt.getUTCMinutes();
    const ss = startingAt.getUTCSeconds();

    // Clamp day to the last day of the target month to avoid overflow:
    // e.g. Jan 31 + 1 month must land on Feb 28/29, not Mar 3.
    const clampToMonth = (y: number, m: number, d: number): number =>
      Math.min(d, new Date(Date.UTC(y, m + 1, 0)).getUTCDate());

    const [ty, tm] =
      frequency === "ANNUAL" ? [year + 1, month] : [year, month + 1];
    const periodEnd = new Date(
      Date.UTC(
        ty,
        tm,
        clampToMonth(ty, tm, startingAt.getUTCDate()),
        hh,
        mm,
        ss
      )
    );
    return { fraction: 1, periodEnd };
  }

  // first_billing_period: prorate from contract start to next 1st-of-month.
  const HOUR_MS = 60 * 60 * 1000;
  const periodStartMs = Date.UTC(year, month, 1);
  const periodEndMs =
    frequency === "ANNUAL"
      ? Date.UTC(year + 1, month, 1)
      : Date.UTC(year, month + 1, 1);
  const totalHours = Math.round((periodEndMs - periodStartMs) / HOUR_MS);
  const remainingHours = Math.round(
    (periodEndMs - startingAt.getTime()) / HOUR_MS
  );
  const fraction = Math.max(0, Math.min(1, remainingHours / totalHours));
  return { fraction, periodEnd: new Date(periodEndMs) };
}

const MONTHS_PER_PAYMENT_FREQUENCY: Record<
  "monthly" | "quarterly" | "semi_annually" | "annually",
  number
> = {
  monthly: 1,
  quarterly: 3,
  semi_annually: 6,
  annually: 12,
};

function buildInvoiceScheduleItems({
  invoiceAmountCents,
  resolvedCurrency,
  alignedStart,
  paymentSchedule,
}: {
  invoiceAmountCents: number;
  resolvedCurrency: SupportedCurrency;
  alignedStart: Date;
  paymentSchedule: {
    frequency:
      | "one_time"
      | "monthly"
      | "quarterly"
      | "semi_annually"
      | "annually";
    periods?: number;
  };
}): { unitPrice: number; quantity: number; timestamp: Date }[] {
  const { frequency, periods } = paymentSchedule;
  if (frequency === "one_time" || !periods || periods <= 1) {
    return [
      {
        unitPrice: metronomeAmount(invoiceAmountCents, resolvedCurrency),
        quantity: 1,
        timestamp: alignedStart,
      },
    ];
  }
  const monthsPerPeriod = MONTHS_PER_PAYMENT_FREQUENCY[frequency];
  const perPeriodCents = Math.floor(invoiceAmountCents / periods);
  const remainderCents = invoiceAmountCents - perPeriodCents * periods;
  return Array.from({ length: periods }, (_, i) => {
    const totalMonths = alignedStart.getUTCMonth() + i * monthsPerPeriod;
    const targetYear =
      alignedStart.getUTCFullYear() + Math.floor(totalMonths / 12);
    const targetMonth = ((totalMonths % 12) + 12) % 12;
    const lastDayOfMonth = new Date(
      Date.UTC(targetYear, targetMonth + 1, 0)
    ).getUTCDate();
    const day =
      i === 0 ? Math.min(alignedStart.getUTCDate(), lastDayOfMonth) : 1;
    const ts = new Date(
      Date.UTC(
        targetYear,
        targetMonth,
        day,
        alignedStart.getUTCHours(),
        alignedStart.getUTCMinutes(),
        alignedStart.getUTCSeconds(),
        alignedStart.getUTCMilliseconds()
      )
    );
    const amountCents =
      i === 0 ? perPeriodCents + remainderCents : perPeriodCents;
    return {
      unitPrice: metronomeAmount(amountCents, resolvedCurrency),
      quantity: 1,
      timestamp: ts,
    };
  });
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
  stripeCustomerId: string | undefined
): Promise<
  Result<{ resolvedCurrency: SupportedCurrency | null }, SwitchContractError>
> {
  if (!stripeCustomerId) {
    return new Ok({ resolvedCurrency: null });
  }
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
  stripeCustomerId: string | undefined;
  stripeCollectionMethod: "charge_automatically" | "send_invoice";
}): Promise<Result<{ metronomeCustomerId: string }, SwitchContractError>> {
  const result = await ensureMetronomeCustomerForWorkspace({
    workspace: ownerLight,
    stripeCustomerId,
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
  resolvedCurrency: SupportedCurrency | null
): Promise<
  Result<
    {
      pkg: MetronomePackageSummary;
      pkgSeatByType: Map<string, PackageSeatConfig>;
      packageAlias: string;
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
    pkg.tier !== "free" &&
    resolvedCurrency &&
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
  if (body.initialCredits && !resolvedCurrency) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "Initial credits require a Stripe customer to invoice — provide a stripeCustomerId."
      )
    );
  }
  const hasSeatCommitment = (body.seats ?? []).some(
    (s) => s.commitmentPrice !== undefined && s.minSeats > 0 && s.rate > 0
  );
  if (hasSeatCommitment && !resolvedCurrency) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "Seat commitments require a Stripe customer to invoice — provide a stripeCustomerId."
      )
    );
  }
  const pkgSeatByType = new Map(pkg.seats.map((s) => [s.seatType, s]));
  for (const seat of body.seats ?? []) {
    if (!isMembershipSeatType(seat.seatType)) {
      continue;
    }
    const pkgSeat = pkgSeatByType.get(seat.seatType);
    if (
      seat.selected &&
      pkgSeat &&
      !pkgSeat.entitled &&
      seat.seatType !== "free" &&
      seat.rate <= 0
    ) {
      return new Err(
        new SwitchContractError(
          "invalid_request",
          `Seat "${seat.seatType}" is not entitled by the selected package and ` +
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
  return new Ok({ pkg, pkgSeatByType, packageAlias });
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

// Persist the per-seat-type billing floors BEFORE provisioning. The
// provisioning sync clamps each seat's quantity up to its configured
// `minSeats`, so the floor must already be in `workspace_seat_limits` when
// that sync runs.
async function persistSeatFloors(
  workspace: LightWorkspaceType,
  body: SwitchContractBody
): Promise<Result<void, SwitchContractError>> {
  for (const seat of body.seats ?? []) {
    if (!isMembershipSeatType(seat.seatType)) {
      continue;
    }
    if (seat.selected && seat.minSeats > 0) {
      const result = await WorkspaceSeatLimitResource.upsert({
        workspace,
        seatType: seat.seatType,
        minSeats: seat.minSeats,
      });
      if (result.isErr()) {
        return new Err(
          new SwitchContractError(
            "metronome_api_error",
            `Failed to persist seat floor for "${seat.seatType}": ${result.error.message}`
          )
        );
      }
    } else {
      await WorkspaceSeatLimitResource.remove({
        workspace,
        seatType: seat.seatType,
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
    defaultPoolCapAwuCredits: body.defaultPoolCapCredits ?? null,
    programmaticMonthlyCapAwuCredits:
      body.programmaticMonthlyCapCredits ?? null,
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
  ownerLight: LightWorkspaceType;
  workspaceModelId: number;
  workspaceId: string;
  swapAt: "current-hour" | "next-hour";
  resolvedCurrency: SupportedCurrency | null;
  stripeSubscriptionId: string | null;
  pkg: MetronomePackageSummary;
  pkgSeatByType: Map<string, PackageSeatConfig>;
  body: SwitchContractBody;
};

// Combine net payment terms, initial credits commit, seat commitment commits,
// and seat rate overrides into a single v2.contracts.edit call.
async function stepContractEdits({
  metronomeCustomerId,
  metronomeContractId,
  alignedStart,
  resolvedCurrency,
  pkg,
  pkgSeatByType,
  body,
}: PostProvisionCtx): Promise<string | null> {
  const addCommits: NonNullable<ContractEditParams["add_commits"]> = [];
  const addOverrides: NonNullable<ContractEditParams["add_overrides"]> = [];

  // Initial credits prepaid commit.
  if (body.initialCredits && resolvedCurrency) {
    const invoiceAmountCents = Math.round(
      body.initialCredits.invoiceAmount * 100
    );
    const scheduleItems = buildInvoiceScheduleItems({
      invoiceAmountCents,
      resolvedCurrency,
      alignedStart,
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

  // Seat commitment commits and rate overrides.
  for (const seat of body.seats ?? []) {
    if (!isMembershipSeatType(seat.seatType)) {
      continue;
    }
    const pkgSeat = pkgSeatByType.get(seat.seatType);
    const billingFrequency = seat.seatType.endsWith("_yearly")
      ? "ANNUAL"
      : "MONTHLY";
    const rateNative = resolvedCurrency
      ? metronomeAmount(Math.round(seat.rate * 100), resolvedCurrency)
      : seat.rate;

    if (
      seat.selected &&
      seat.commitmentPrice &&
      seat.commitmentPrice > 0 &&
      seat.minSeats > 0 &&
      seat.rate > 0 &&
      resolvedCurrency &&
      pkgSeat
    ) {
      const fiatCreditTypeId = CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency];
      const { fraction, periodEnd } = firstPeriodCommitment(
        alignedStart,
        billingFrequency,
        pkg.billingAnchor
      );
      const accessAmountNative =
        Math.round(seat.minSeats * rateNative * fraction * 100) / 100;
      const seatScheduleItems = buildInvoiceScheduleItems({
        invoiceAmountCents: Math.round(seat.commitmentPrice * 100),
        resolvedCurrency,
        alignedStart,
        paymentSchedule: seat.paymentSchedule,
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
              ending_before: floorToHourISO(periodEnd),
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
      seat.rate > 0 &&
      rateNative !== pkgSeat.defaultRate;
    const needsDisable = !seat.selected && pkgSeat != null && pkgSeat.entitled;
    if (resolvedCurrency && pkgSeat && (needsEntitle || rateChanged)) {
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
    } else if (resolvedCurrency && pkgSeat && needsDisable) {
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
    addOverrides.length === 0
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
}: PostProvisionCtx): Promise<string | null> {
  const result = await remapMembershipSeatTypesForContract({
    metronomeCustomerId,
    contractId: metronomeContractId,
    workspace: ownerLight,
    swapAt,
    startingAt: alignedStart,
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
  body,
}: PostProvisionCtx): Promise<string | null> {
  const result = await syncSeatCount({
    metronomeCustomerId,
    contractId: metronomeContractId,
    workspace: ownerLight,
    startingAt: alignedStart.toISOString(),
    planCode: body.planCode,
  });
  if (result.isErr()) {
    return `seat_sync: ${result.error.message}`;
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

  const stripeResult = await resolveStripeCustomer(body.stripeCustomerId);
  if (stripeResult.isErr()) {
    return new Err(stripeResult.error);
  }
  const { resolvedCurrency } = stripeResult.value;

  const customerResult = await resolveMetronomeCustomer({
    ownerLight,
    stripeCustomerId: body.stripeCustomerId,
    stripeCollectionMethod: body.stripeCollectionMethod,
  });
  if (customerResult.isErr()) {
    return new Err(customerResult.error);
  }
  const { metronomeCustomerId } = customerResult.value;

  const packageResult = await resolveAndValidatePackage(body, resolvedCurrency);
  if (packageResult.isErr()) {
    return new Err(packageResult.error);
  }
  const { pkg, pkgSeatByType, packageAlias } = packageResult.value;

  const timingResult = resolveSwapTiming(body.startingAt);
  if (timingResult.isErr()) {
    return new Err(timingResult.error);
  }
  const { startingAtDate, swapAt } = timingResult.value;

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

  // ─── Provision ────────────────────────────────────────────────────────────
  // Disable the internal seat sync — switchContract always runs its own
  // remap + sync at the end (after seat-rate overrides), so the contract sees
  // the final effective entitlements.
  const provisionResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: ownerLight,
    packageAlias,
    startingAt: startingAtDate,
    swapAt,
    enableStripeBilling: body.stripeCustomerId !== undefined,
    planCode: body.planCode,
    fromContractId: currentSubscription?.metronomeContractId ?? undefined,
    enableSeatSync: false,
    additionalCustomFields: body.hubspotDealId
      ? { [HUBSPOT_DEAL_ID_CUSTOM_FIELD_KEY]: body.hubspotDealId }
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
  const { metronomeContractId } = provisionResult.value;

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
    ownerLight,
    workspaceModelId: owner.id,
    workspaceId: owner.sId,
    swapAt,
    resolvedCurrency,
    stripeSubscriptionId: currentSubscription?.stripeSubscriptionId ?? null,
    pkg,
    pkgSeatByType,
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
  warn(await stepStripeCancellation(ctx));

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
