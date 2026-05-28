import {
  dispatchPaygDisabled,
  dispatchPaygEnabled,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
import type { Authenticator } from "@app/lib/auth";
import {
  ceilToHourISO,
  floorToHourISO,
  listMetronomePackages,
} from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  provisionMetronomeContract,
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
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { z } from "zod";

// PAYG cap for credit-priced contracts is denominated in AWU credits, written
// to `credit_usage_configuration.paygCapCredits` verbatim. We deliberately do
// NOT accept dollars/euros here and do NOT convert from any fiat unit —
// `programmatic_usage_configuration.paygCapMicroUsd` (micro_usd) is a legacy
// concern of the programmatic-usage flow and must stay out of this path.
export const MAX_PAYG_CAP_CREDITS = 2_000_000;

export const SwitchContractBodySchema = z
  .object({
    planCode: z.string().min(1),
    metronomePackageId: z.string().min(1),
    // ISO timestamp. Required and validated to be ≥1h in the future when the
    // selected package is enterprise-tier; forbidden otherwise (Pro/Business
    // swap at the current hour).
    startingAt: z.string().optional(),
    // Optional: required for paid tiers (pro/business/enterprise), omitted
    // for free-tier switches where Metronome contracts have no Stripe link.
    stripeCustomerId: z.string().min(1).optional(),
    paygEnabled: z.boolean().default(false),
    // AWU credits — written directly to `credit_usage_configuration.paygCapCredits`.
    paygCapCredits: z
      .number()
      .int("PAYG cap must be an integer number of credits")
      .min(1, "PAYG cap must be at least 1 credit")
      .max(
        MAX_PAYG_CAP_CREDITS,
        `PAYG cap cannot exceed ${MAX_PAYG_CAP_CREDITS.toLocaleString()} credits`
      )
      .optional(),
  })
  .refine((data) => !data.paygEnabled || data.paygCapCredits !== undefined, {
    message: "PAYG cap is required when Pay-as-you-go is enabled.",
    path: ["paygCapCredits"],
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

  // Resolve when the swap happens.
  //  - startingAt provided: schedule at the requested moment, ceiled to the
  //    next hour boundary. Must be ≥1h in the future.
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
    const ONE_HOUR_MS = 60 * 60 * 1000;
    if (requestedStartMs < Date.now() + ONE_HOUR_MS) {
      return new Err(
        new SwitchContractError(
          "invalid_request",
          "startingAt must be at least one hour in the future."
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

  // Match `provisionMetronomeContract`'s internal alignment so the pending
  // subscription's startDate matches the Metronome contract's starting_at.
  const alignedStart = new Date(
    swapAt === "current-hour"
      ? floorToHourISO(startingAtDate)
      : ceilToHourISO(startingAtDate)
  );

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

  // The operator supplies the PAYG cap in AWU credits directly — no fiat
  // conversion. The value is written verbatim to
  // `credit_usage_configuration.paygCapCredits` (see `MAX_PAYG_CAP_CREDITS`).
  const paygCapCredits =
    body.paygEnabled && body.paygCapCredits !== undefined
      ? body.paygCapCredits
      : null;
  if (creditConfig) {
    const updateResult = await creditConfig.updateConfiguration(auth, {
      paygCapCredits,
    });
    if (updateResult.isErr()) {
      return new Err(
        new SwitchContractError(
          "payg_config_failed",
          `Failed to update PAYG configuration: ${updateResult.error.message}`
        )
      );
    }
  } else if (paygCapCredits !== null) {
    const createResult = await CreditUsageConfigurationResource.makeNew(auth, {
      defaultDiscountPercent: 0,
      paygCapCredits,
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
