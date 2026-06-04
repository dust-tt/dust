import {
  dispatchPaygDisabled,
  dispatchPaygEnabled,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import { metronomeAmount } from "@app/lib/metronome/amounts";
import {
  addPrepaidCommitToContract,
  ceilToHourISO,
  editMetronomeContract,
  floorToHourISO,
  listMetronomePackages,
} from "@app/lib/metronome/client";
import {
  AWU_PRIORITY_PURCHASED_COMMIT,
  CURRENCY_TO_CREDIT_TYPE_ID,
  getCreditTypeAwuId,
  getProductPrepaidCommitId,
  getProductSeatSubscriptionCreditsId,
} from "@app/lib/metronome/constants";
import {
  applySeatRateOverrides,
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
  type SeatRateOverride,
  syncContractQuantities,
} from "@app/lib/metronome/contracts";
import { remapMembershipSeatTypesForContract } from "@app/lib/metronome/seats";
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
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { WorkspaceSeatLimitResource } from "@app/lib/resources/workspace_seat_limit_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import { isMembershipSeatType } from "@app/types/memberships";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

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
      })
    )
    .optional(),
});

export type SwitchContractBody = z.infer<typeof SwitchContractBodySchema>;

export type SwitchContractErrorKind =
  // Bad input or precondition not met — handler should return 400.
  | "invalid_request"
  // Metronome (or other upstream) API failure before any state was changed.
  | "metronome_api_error"
  // Provisioned the Metronome contract but a follow-up step failed. Manual
  // cleanup may be required; the message documents what's left to undo.
  | "provision_inconsistent"
  // PAYG configuration update/create failed after provisioning completed.
  | "payg_config_failed";

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
 * First-period proration for a seat commitment. The seat billing period is
 * anchored to the 1st of the contract-start month; when the contract starts
 * mid-period the slice already elapsed (1st of month → contract start) is
 * removed from the granted credit.
 *
 * Returns the remaining `fraction` of the period (computed at hour
 * granularity) and `periodEnd` — the next 1st-of-month boundary the commit
 * should end before, so the prorated credit covers exactly the partial term.
 */
function firstPeriodProration(
  startingAt: Date,
  frequency: "MONTHLY" | "ANNUAL"
): { fraction: number; periodEnd: Date } {
  const HOUR_MS = 60 * 60 * 1000;
  const year = startingAt.getUTCFullYear();
  const month = startingAt.getUTCMonth();
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

/**
 * Provision a Metronome contract for the workspace and align local state
 * (pending subscription, Stripe cancellation schedule, WorkOS org, PAYG
 * configuration, PAYG dispatcher).
 *
 * Side-effects that must succeed for the result to be `Ok`:
 *   - Ensure Metronome customer
 *   - Provision the Metronome contract
 *   - Create the pending local subscription
 *   - Schedule Stripe cancellation (if a Stripe sub exists)
 *   - PAYG configuration update / create (if applicable)
 *
 * Best-effort (failures are logged but do not fail the operation):
 *   - WorkOS organization provisioning
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

  // Workspace must be Metronome-billed (current sub Metronome-only) or
  // Metronome-eligible (Metronome billing enabled). Stripe-billed workspaces
  // that have opted into Metronome billing land here too — their Stripe sub
  // is scheduled to end at the swap time further down.
  const isCurrentlyMetronomeOnlyBilled =
    currentSubscription?.isMetronomeOnlyBilled ?? false;
  const metronomeBillingEnabled = await isMetronomeBillingEnabled(auth);
  if (!isCurrentlyMetronomeOnlyBilled && !metronomeBillingEnabled) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "switch_contract is only available for Metronome-billed workspaces. " +
          "Migrate the workspace to Metronome billing before invoking this flow."
      )
    );
  }

  const creditConfig =
    await CreditUsageConfigurationResource.fetchByWorkspaceId(auth);

  // Validate the Stripe customer exists before we touch Metronome.
  // For free-tier switches the operator may omit the Stripe customer entirely
  // — the contract is created without Stripe billing wired in.
  let resolvedCurrency: SupportedCurrency | null = null;
  if (body.stripeCustomerId) {
    const stripeCustomer = await getStripeCustomer(body.stripeCustomerId);
    if (!stripeCustomer) {
      return new Err(
        new SwitchContractError(
          "invalid_request",
          `Stripe customer not found: ${body.stripeCustomerId}.`
        )
      );
    }
    resolvedCurrency = resolveCurrencyFromStripe({ stripeCustomer });
  }

  // Resolve the Metronome customer.
  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: renderLightWorkspaceType({ workspace: owner }),
    stripeCustomerId: body.stripeCustomerId,
    stripeCollectionMethod: body.stripeCollectionMethod,
  });
  if (customerResult.isErr()) {
    return new Err(
      new SwitchContractError(
        "metronome_api_error",
        `Failed to ensure Metronome customer: ${customerResult.error.message}`
      )
    );
  }
  const { metronomeCustomerId } = customerResult.value;

  // Resolve the package and classify its tier.
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
  // Free packages are currency-agnostic (price is 0) — skip the currency
  // match check. For paid tiers, the resolved Stripe currency must match the
  // package's currency.
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
  // Plan ↔ package tier compatibility.
  const compat = validatePlanPackageCompat(body.planCode, pkg.tier);
  if (!compat.ok) {
    return new Err(new SwitchContractError("invalid_request", compat.message));
  }

  if (body.paygEnabled && !isPaygEligibleTier(pkg.tier)) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        `Pay-as-you-go can only be enabled for ${PAYG_ELIGIBLE_TIERS.join(
          " or "
        )} contracts.`
      )
    );
  }

  // Initial credits are invoiced through the contract's Stripe billing config,
  // so they require a Stripe customer (and therefore a resolved currency).
  if (body.initialCredits && !resolvedCurrency) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "Initial credits require a Stripe customer to invoice — provide a " +
          "stripeCustomerId."
      )
    );
  }

  // Seat commitments are invoiced as prepaid commits — same requirement.
  const hasSeatCommitment = (body.seats ?? []).some(
    (s) => s.commitmentPrice !== undefined && s.minSeats > 0 && s.rate > 0
  );
  if (hasSeatCommitment && !resolvedCurrency) {
    return new Err(
      new SwitchContractError(
        "invalid_request",
        "Seat commitments require a Stripe customer to invoice — provide a " +
          "stripeCustomerId."
      )
    );
  }

  // A seat the package does not entitle by default can be entitled here, but
  // only at an explicit non-zero rate — except the free seat, which is allowed
  // at rate 0. This guards against accidentally entitling a paid seat for free.
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

  // Resolve when the swap happens.
  //  - startingAt provided: schedule at the requested moment, ceiled to the
  //    next hour boundary. Any moment is accepted, including the past — the
  //    operator is trusted to backdate a contract when reconciling.
  //  - startingAt omitted: swap immediately at the current hour boundary
  //    (supported for all tiers, including enterprise via the operator's
  //    explicit "start immediately" opt-in).
  let startingAtDate: Date;
  let swapAt: "current-hour" | "next-hour";
  if (body.startingAt) {
    const requestedStartMs = Date.parse(body.startingAt);
    if (Number.isNaN(requestedStartMs)) {
      return new Err(
        new SwitchContractError(
          "invalid_request",
          "startingAt is not a valid ISO timestamp."
        )
      );
    }
    startingAtDate = new Date(requestedStartMs);
    swapAt = "next-hour";
  } else {
    startingAtDate = new Date();
    swapAt = "current-hour";
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

  // Persist the per-seat-type billing floors BEFORE provisioning. The
  // provisioning sync (`syncContractQuantities` inside
  // `provisionMetronomeContract`) clamps each seat's quantity up to its
  // configured `minSeats`, so the floor must already be in
  // `workspace_seat_limits` when that sync runs — otherwise the first sync
  // bills the actual headcount and the floor only takes effect on a later sync.
  // (The seat commitment + rate overrides run after provisioning, below, since
  // they need the contract id.)
  for (const seat of body.seats ?? []) {
    if (!isMembershipSeatType(seat.seatType)) {
      continue;
    }
    // A deselected seat carries no billing floor — clear any existing one.
    if (seat.selected && seat.minSeats > 0) {
      await WorkspaceSeatLimitResource.upsert({
        workspace: owner,
        seatType: seat.seatType,
        minSeats: seat.minSeats,
      });
    } else {
      await WorkspaceSeatLimitResource.remove({
        workspace: owner,
        seatType: seat.seatType,
      });
    }
  }

  const provisionResult = await provisionMetronomeContract({
    metronomeCustomerId,
    workspace: renderLightWorkspaceType({ workspace: owner }),
    packageAlias,
    startingAt: startingAtDate,
    swapAt,
    enableStripeBilling: body.stripeCustomerId !== undefined,
    planCode: body.planCode,
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

  // Net payment terms can't be passed at package-provision time (Metronome
  // restricts the create payload when provisioning from a package), so apply
  // it as a follow-up edit on the freshly created contract.
  if (body.netPaymentTermsDays !== undefined) {
    const netTermsResult = await editMetronomeContract({
      contract_id: metronomeContractId,
      customer_id: metronomeCustomerId,
      update_net_payment_terms_days: body.netPaymentTermsDays,
    });
    if (netTermsResult.isErr()) {
      return new Err(
        new SwitchContractError(
          "provision_inconsistent",
          `Provisioned Metronome contract ${metronomeContractId} but failed to ` +
            `set net payment terms to ${body.netPaymentTermsDays} days: ` +
            `${netTermsResult.error.message}. Manual cleanup may be required.`
        )
      );
    }
  }

  // Match `provisionMetronomeContract`'s internal alignment so the pending
  // subscription's startDate matches the Metronome contract's starting_at.
  const alignedStart = new Date(
    swapAt === "current-hour"
      ? floorToHourISO(startingAtDate)
      : ceilToHourISO(startingAtDate)
  );

  // Optional one-off initial credits: a contract-level prepaid AWU commit
  // starting with the contract and lasting one year. `invoiceAmount` is in the
  // customer's currency major units; convert to Metronome fiat units (cents
  // for USD, whole units for EUR) for the invoice unit price.
  if (body.initialCredits && resolvedCurrency) {
    const oneYearAfterStart = new Date(alignedStart);
    oneYearAfterStart.setUTCFullYear(oneYearAfterStart.getUTCFullYear() + 1);

    const invoiceAmountCents = Math.round(
      body.initialCredits.invoiceAmount * 100
    );
    const invoiceUnitPrice = metronomeAmount(
      invoiceAmountCents,
      resolvedCurrency
    );

    const commitResult = await addPrepaidCommitToContract({
      metronomeCustomerId,
      metronomeContractId,
      productId: getProductPrepaidCommitId(),
      accessAmount: body.initialCredits.amountCredits,
      accessCreditTypeId: getCreditTypeAwuId(),
      accessStartingAt: alignedStart,
      accessEndingBefore: oneYearAfterStart,
      invoiceUnitPrice,
      invoiceQuantity: 1,
      invoiceCreditTypeId: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
      invoiceTimestamp: alignedStart,
      priority: AWU_PRIORITY_PURCHASED_COMMIT,
      applicableProductTags: ["usage"],
      name: `Initial credits: ${body.initialCredits.amountCredits.toLocaleString()} credits`,
      // Scope the key to the freshly provisioned contract: a retroactive
      // start can otherwise collide with a prior switch that shared the same
      // workspace, start moment, and amount.
      uniquenessKey: `initial-credits-${metronomeContractId}-${body.initialCredits.amountCredits}`,
    });
    if (commitResult.isErr()) {
      return new Err(
        new SwitchContractError(
          "provision_inconsistent",
          `Provisioned Metronome contract ${metronomeContractId} but failed to ` +
            `add the initial credits commit: ${commitResult.error.message}. ` +
            "Manual cleanup may be required."
        )
      );
    }
  }

  // Persist the future-state subscription in `created_backend_only`; the
  // `contract.start` webhook flips it to `active` (and ends the current one).
  // Any prior pending sub for this workspace is ended in the same txn.
  try {
    await SubscriptionResource.createPendingMetronomeContract({
      workspaceModelId: owner.id,
      planCode: body.planCode,
      metronomeContractId,
      startDate: alignedStart,
    });
  } catch (err) {
    return new Err(
      new SwitchContractError(
        "provision_inconsistent",
        `Provisioned Metronome contract ${metronomeContractId} but failed to ` +
          `create pending subscription: ${normalizeError(err).message}. ` +
          "Manual cleanup may be required."
      )
    );
  }

  // If the workspace is currently Stripe-billed (incl. shadow-Metronome),
  // schedule the Stripe sub to cancel at the swap moment so the two rails
  // don't double-bill.
  const stripeSubscriptionIdToCancel =
    currentSubscription?.stripeSubscriptionId ?? null;
  if (stripeSubscriptionIdToCancel) {
    try {
      await scheduleSubscriptionCancellation({
        stripeSubscriptionId: stripeSubscriptionIdToCancel,
        cancelAt: alignedStart,
      });
    } catch (err) {
      return new Err(
        new SwitchContractError(
          "provision_inconsistent",
          `Provisioned Metronome contract ${metronomeContractId} and pending ` +
            `subscription, but failed to schedule cancellation of Stripe ` +
            `subscription ${stripeSubscriptionIdToCancel}: ` +
            `${normalizeError(err).message}. ` +
            `URGENT: cancel the Stripe subscription manually at ${alignedStart.toISOString()} ` +
            "to avoid double-billing."
        )
      );
    }
  }

  // Ensure the workspace has a WorkOS organization for any paid tier.
  // Idempotent — `contract.start` webhook re-runs this as a safety net.
  if (pkg.tier !== "free") {
    const workosResult = await getOrCreateWorkOSOrganization(
      renderLightWorkspaceType({ workspace: owner })
    );
    if (workosResult.isErr()) {
      logger.error(
        {
          workspaceId: owner.sId,
          metronomeContractId,
          err: workosResult.error,
        },
        "[switch_contract] Failed to provision WorkOS organization"
      );
    }
  }

  // Per-seat-type settings: create a prepaid commit when a commitment price is
  // set, and apply a rate override when the seat rate was changed. The billing
  // floor (`minSeats`) was already persisted before provisioning (above) so the
  // provisioning sync could clamp to it.
  if (body.seats && body.seats.length > 0) {
    // `pkgSeatByType` (built above) maps every seat type the package knows about
    // to its config — used to target rate overrides, detect rate changes, and
    // tell entitled seats apart from ones the operator is opting into.
    const seatRateOverrides: SeatRateOverride[] = [];

    for (const seat of body.seats) {
      if (!isMembershipSeatType(seat.seatType)) {
        continue;
      }
      const pkgSeat = pkgSeatByType.get(seat.seatType);
      const billingFrequency = seat.seatType.endsWith("_yearly")
        ? "ANNUAL"
        : "MONTHLY";

      // `rate` / `commitmentPrice` arrive in the currency's major units
      // (dollars / euros). Convert to Metronome's fiat unit (cents for USD,
      // whole units for EUR) — the unit `pkgSeat.defaultRate`, the rate-card
      // override price, and the fiat credit type all use. No-op when there is
      // no resolved currency (free / no-Stripe switch, where seat commits and
      // overrides don't run anyway).
      const rateNative = resolvedCurrency
        ? metronomeAmount(Math.round(seat.rate * 100), resolvedCurrency)
        : seat.rate;

      // One-off seat commitment: grant `minSeats * rate` of contract credit
      // (the list value of the committed seats), invoiced at the negotiated
      // `commitmentPrice`. Not recurring — renegotiated at renewal. The access
      // credit is prorated to the first partial period (the slice from the 1st
      // of the month to the contract start is removed) and ends at the next
      // 1st-of-month boundary. `rateNative`/`commitmentPriceNative` are already
      // in the contract's fiat unit (matching the fiat credit type).
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
        const { fraction, periodEnd } = firstPeriodProration(
          alignedStart,
          billingFrequency
        );
        // Access credit (the committed seats' list value) and the negotiated
        // invoice price, both in the contract's fiat unit (cents for USD, whole
        // units for EUR — the unit the fiat credit type expects).
        const accessAmountNative =
          Math.round(seat.minSeats * rateNative * fraction * 100) / 100;
        const commitmentPriceNative = metronomeAmount(
          Math.round(seat.commitmentPrice * 100),
          resolvedCurrency
        );
        const commitResult = await addPrepaidCommitToContract({
          metronomeCustomerId,
          metronomeContractId,
          // "Seat Individual Credits" — the fiat seat-credit product (named
          // "credit" but denominated in the contract's fiat currency).
          productId: getProductSeatSubscriptionCreditsId(),
          accessAmount: accessAmountNative,
          accessCreditTypeId: fiatCreditTypeId,
          accessStartingAt: alignedStart,
          accessEndingBefore: periodEnd,
          invoiceUnitPrice: commitmentPriceNative,
          invoiceQuantity: 1,
          invoiceCreditTypeId: fiatCreditTypeId,
          invoiceTimestamp: alignedStart,
          priority: AWU_PRIORITY_PURCHASED_COMMIT,
          // Draw only against this seat's product, not all `usage`.
          applicableProductIds: [pkgSeat.productId],
          name: `${pkgSeat.productName} commitment: ${seat.minSeats} seats`,
          // Scope the key to the freshly-provisioned contract so re-running the
          // switch (which provisions a new contract) can't collide with a
          // previous attempt's key (same workspace/seat/start time).
          uniquenessKey: `seat-commitment-${metronomeContractId}-${seat.seatType}`,
        });
        if (commitResult.isErr()) {
          return new Err(
            new SwitchContractError(
              "provision_inconsistent",
              `Provisioned Metronome contract ${metronomeContractId} but failed ` +
                `to add the ${seat.seatType} seat commitment: ` +
                `${commitResult.error.message}. Manual cleanup may be required.`
            )
          );
        }
      }

      // Seat override, applied as an OVERWRITE on the contract:
      //  - selected + not entitled by the package → entitle it (the operator
      //    opted in), or
      //  - selected + entitled but the operator changed its rate from the
      //    package default → set the new rate, or
      //  - deselected but entitled by the package → disable it (`entitled:
      //    false`, price 0) so the package's default seat is turned off.
      // The free seat is allowed in at rate 0; paid seats are validated to a
      // positive rate above before reaching this point.
      const needsEntitle = seat.selected && pkgSeat ? !pkgSeat.entitled : false;
      const rateChanged =
        seat.selected &&
        pkgSeat != null &&
        pkgSeat.entitled &&
        seat.rate > 0 &&
        rateNative !== pkgSeat.defaultRate;
      const needsDisable =
        !seat.selected && pkgSeat != null && pkgSeat.entitled;
      if (resolvedCurrency && pkgSeat && (needsEntitle || rateChanged)) {
        seatRateOverrides.push({
          productId: pkgSeat.productId,
          billingFrequency,
          priceNative: rateNative,
          creditTypeId: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
          entitled: true,
        });
      } else if (resolvedCurrency && pkgSeat && needsDisable) {
        seatRateOverrides.push({
          productId: pkgSeat.productId,
          billingFrequency,
          priceNative: 0,
          creditTypeId: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
          entitled: false,
        });
      }
    }

    const overridesResult = await applySeatRateOverrides({
      metronomeCustomerId,
      contractId: metronomeContractId,
      startingAt: alignedStart.toISOString(),
      overrides: seatRateOverrides,
    });
    if (overridesResult.isErr()) {
      return new Err(
        new SwitchContractError(
          "provision_inconsistent",
          `Provisioned Metronome contract ${metronomeContractId} but failed to ` +
            `apply seat rate overrides: ${overridesResult.error.message}. ` +
            "Manual cleanup may be required."
        )
      );
    }

    // Re-remap memberships and re-sync seat quantities now that entitlements
    // have changed. Both ran inside `provisionMetronomeContract` BEFORE these
    // overrides were applied, so they only saw the package's default-entitled
    // seats. Without re-running:
    //  - a membership on a seat the operator just DISABLED (e.g. pro_yearly,
    //    swapped for pro) would stay on that now-unbilled seat type, and
    //  - a seat the operator just ENTITLED would stay at quantity 0 (unbilled).
    // The remap moves members off disabled seats onto an entitled one; the sync
    // then reconciles quantities. Both re-fetch the contract fresh (no cache),
    // so the new effective entitlements are visible. Skipped when no override
    // changed entitlement.
    if (seatRateOverrides.length > 0) {
      const ownerLight = renderLightWorkspaceType({ workspace: owner });
      const remapResult = await remapMembershipSeatTypesForContract({
        metronomeCustomerId,
        contractId: metronomeContractId,
        workspace: ownerLight,
        swapAt,
        startingAt: alignedStart,
      });
      if (remapResult.isErr()) {
        return new Err(
          new SwitchContractError(
            "provision_inconsistent",
            `Provisioned Metronome contract ${metronomeContractId} and applied ` +
              `seat entitlement overrides, but failed to re-map membership seat ` +
              `types: ${remapResult.error.message}. Members may remain on a seat ` +
              "type the new contract no longer bills. Manual reconciliation may " +
              "be required."
          )
        );
      }

      const resyncResult = await syncContractQuantities(
        metronomeCustomerId,
        metronomeContractId,
        ownerLight,
        alignedStart.toISOString()
      );
      if (resyncResult.isErr()) {
        return new Err(
          new SwitchContractError(
            "provision_inconsistent",
            `Provisioned Metronome contract ${metronomeContractId} and applied ` +
              `seat entitlement overrides, but failed to re-sync seat ` +
              `quantities: ${resyncResult.error.message}. The newly entitled ` +
              "seats may bill at quantity 0 until the next sync. Manual " +
              "reconciliation may be required."
          )
        );
      }
    }
  }

  // The operator supplies the AWU usage cap in credits directly — no fiat
  // conversion. The value is written verbatim to
  // `credit_usage_configuration.usageCapCredits` (see `MAX_USAGE_CAP_CREDITS`).
  // `paygEnabled` and `usageCapCredits` are stored independently.
  const usageCapCredits = body.usageCapCredits ?? null;
  if (creditConfig) {
    const updateResult = await creditConfig.updateConfiguration(auth, {
      paygEnabled: body.paygEnabled,
      usageCapCredits,
    });
    if (updateResult.isErr()) {
      return new Err(
        new SwitchContractError(
          "payg_config_failed",
          `Failed to update PAYG configuration: ${updateResult.error.message}`
        )
      );
    }
  } else if (body.paygEnabled || usageCapCredits !== null) {
    const createResult = await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      paygEnabled: body.paygEnabled,
      usageCapCredits,
    });
    if (createResult.isErr()) {
      return new Err(
        new SwitchContractError(
          "payg_config_failed",
          `Failed to create PAYG configuration: ${createResult.error.message}`
        )
      );
    }
  }

  // Note: the Metronome AWU PAYG cap alert is no longer synced from this
  // endpoint. AWU concerns (discount, AWU PAYG cap) live on
  // `credit_usage_configuration` and are managed via the
  // "Manage Credit Usage Configuration" poke plugin.

  const workspaceResource = await WorkspaceResource.fetchById(owner.sId);
  if (workspaceResource) {
    if (body.paygEnabled) {
      await dispatchPaygEnabled({ workspace: workspaceResource });
    } else {
      await dispatchPaygDisabled({ workspace: workspaceResource });
    }
  }

  return new Ok({ metronomeContractId });
}
