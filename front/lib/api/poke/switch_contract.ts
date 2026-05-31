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
} from "@app/lib/metronome/contracts";
import {
  isPaygEligibleTier,
  type MetronomePackageTier,
  PAYG_ELIGIBLE_TIERS,
} from "@app/lib/metronome/types";
import { resolveCurrencyFromStripe } from "@app/lib/plans/billing_currency";
import {
  CREDIT_PRICED_BUSINESS_PLAN_CODE,
  isEntreprisePlanPrefix,
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
  if (isEntreprisePlanPrefix(planCode)) {
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

  // Per-seat-type settings: persist the billing floor (`minSeats`) to
  // `workspace_seat_limits`, and create a prepaid commit when a commitment
  // price is set.
  if (body.seats && body.seats.length > 0) {
    // Seat product + default rate by seat type, from the package's entitlement
    // overrides — used to target rate overrides and detect rate changes.
    const pkgSeatByType = new Map(pkg.seats.map((s) => [s.seatType, s]));
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

      // Billing floor → workspace_seat_limits. A minimum of 0 means "no floor"
      // → drop any existing row. A DB failure here throws (→ 500): the seat
      // sync at contract start reconciles Metronome from these rows, so the
      // operator must know the floor wasn't persisted.
      if (seat.minSeats > 0) {
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

      // One-off seat commitment: grant `minSeats * rate` of contract credit
      // (the list value of the committed seats), invoiced at the negotiated
      // `commitmentPrice`. Not recurring — renegotiated at renewal. The access
      // credit is prorated to the first partial period (the slice from the 1st
      // of the month to the contract start is removed) and ends at the next
      // 1st-of-month boundary. `rateNative`/`commitmentPriceNative` are already
      // in the contract's fiat unit (matching the fiat credit type).
      if (
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

      // Seat rate override: when the operator changed the seat rate from the
      // package default, overwrite the seat product's rate on the contract.
      if (
        resolvedCurrency &&
        pkgSeat &&
        seat.rate > 0 &&
        rateNative !== pkgSeat.defaultRate
      ) {
        seatRateOverrides.push({
          productId: pkgSeat.productId,
          billingFrequency,
          priceNative: rateNative,
          creditTypeId: CURRENCY_TO_CREDIT_TYPE_ID[resolvedCurrency],
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
      disableCreditCapWarning: false,
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
