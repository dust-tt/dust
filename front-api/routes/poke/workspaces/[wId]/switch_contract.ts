import {
  dispatchPaygDisabled,
  dispatchPaygEnabled,
} from "@app/lib/api/metronome/credit_state_dispatcher";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import { MAX_PAYG_CAP_DOLLARS } from "@app/lib/api/poke/plugins/workspaces/manage_programmatic_usage_configuration";
import { isMetronomeBillingEnabled } from "@app/lib/api/subscription";
import { getOrCreateWorkOSOrganization } from "@app/lib/api/workos/organization";
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
import { getStripeCustomer } from "@app/lib/plans/stripe";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import type { SupportedCurrency } from "@app/types/currency";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export interface PokeSwitchContractSuccessResponseBody {
  success: boolean;
}

const SwitchContractBodySchema = z
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
    paygCapDollars: z
      .number()
      .min(1, "PAYG cap must be at least $1")
      .max(
        MAX_PAYG_CAP_DOLLARS,
        `PAYG cap cannot exceed $${MAX_PAYG_CAP_DOLLARS.toLocaleString()}`
      )
      .optional(),
  })
  .refine((data) => !data.paygEnabled || data.paygCapDollars !== undefined, {
    message: "PAYG cap is required when Pay-as-you-go is enabled.",
    path: ["paygCapDollars"],
  });

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
): Result<void, Error> {
  const planTier = classifyPlanCode(planCode);
  if (planTier !== packageTier) {
    return new Err(
      new Error(
        `Plan ${planCode} (tier "${planTier}") does not match the selected ` +
          `Metronome package (tier "${packageTier}").`
      )
    );
  }
  return new Ok(undefined);
}

// Mounted at /api/poke/workspaces/:wId/switch_contract.
const app = pokeApp();

app.post(
  "/",
  async (ctx): HandlerResult<PokeSwitchContractSuccessResponseBody> => {
    const auth = ctx.get("auth");
    const owner = auth.getNonNullableWorkspace();
    const rawBody = await ctx.req.json().catch(() => ({}));

    const plugin = pluginManager.getNonNullablePlugin("switch-contract");
    const pluginRun = await PluginRunResource.makeNew(
      plugin,
      rawBody,
      auth.getNonNullableUser(),
      owner,
      { resourceId: owner.sId, resourceType: "workspaces" }
    );

    const validation = SwitchContractBodySchema.safeParse(rawBody);
    if (!validation.success) {
      const errorMessage = `The request body is invalid: ${fromError(validation.error).toString()}`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: errorMessage,
        },
      });
    }
    const body = validation.data;

    // Workspace must be Metronome-billed (current sub Metronome-only) or
    // freshly Metronome-eligible (Metronome billing enabled + no Stripe sub).
    const currentSubscription = auth.subscriptionResource();
    const isCurrentlyMetronomeOnlyBilled =
      currentSubscription?.isMetronomeOnlyBilled ?? false;
    const metronomeBillingEnabled = await isMetronomeBillingEnabled(auth);
    const canStartFreshMetronomeContract =
      metronomeBillingEnabled && !currentSubscription?.stripeSubscriptionId;
    if (!isCurrentlyMetronomeOnlyBilled && !canStartFreshMetronomeContract) {
      const errorMessage =
        "switch_contract is only available for Metronome-billed workspaces. " +
        "Migrate the workspace to Metronome billing before invoking this flow.";
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }

    const programmaticConfig =
      await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);

    // Validate the Stripe customer exists before we touch Metronome.
    // For free-tier switches the operator may omit the Stripe customer entirely
    // — the contract is created without Stripe billing wired in.
    let resolvedCurrency: SupportedCurrency | null = null;
    if (body.stripeCustomerId) {
      const stripeCustomer = await getStripeCustomer(body.stripeCustomerId);
      if (!stripeCustomer) {
        const errorMessage = `Stripe customer not found: ${body.stripeCustomerId}.`;
        await pluginRun.recordError(errorMessage);
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message: errorMessage },
        });
      }
      resolvedCurrency = resolveCurrencyFromStripe({ stripeCustomer });
    }

    const customerResult = await ensureMetronomeCustomerForWorkspace({
      workspace: renderLightWorkspaceType({ workspace: owner }),
      stripeCustomerId: body.stripeCustomerId,
    });
    if (customerResult.isErr()) {
      const errorMessage = `Failed to ensure Metronome customer: ${customerResult.error.message}`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 502,
        api_error: { type: "internal_server_error", message: errorMessage },
      });
    }
    const { metronomeCustomerId } = customerResult.value;

    const packagesResult = await listMetronomePackages();
    if (packagesResult.isErr()) {
      const errorMessage = `Failed to list Metronome packages: ${packagesResult.error.message}`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 502,
        api_error: { type: "internal_server_error", message: errorMessage },
      });
    }
    const pkg = packagesResult.value.find(
      (p) => p.id === body.metronomePackageId
    );
    if (!pkg) {
      const errorMessage = `Metronome package not found: ${body.metronomePackageId}`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }
    // Free packages are currency-agnostic (price is 0) — skip the currency
    // match check. For paid tiers, the resolved Stripe currency must match the
    // package's currency.
    if (
      pkg.tier !== "free" &&
      resolvedCurrency &&
      pkg.currency !== resolvedCurrency
    ) {
      const errorMessage =
        `Metronome package ${body.metronomePackageId} is ${pkg.currency.toUpperCase()}, ` +
        `but Stripe customer ${body.stripeCustomerId} resolves to ` +
        `${resolvedCurrency.toUpperCase()}. Pick a ${resolvedCurrency.toUpperCase()} package.`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
    }
    const compatResult = validatePlanPackageCompat(body.planCode, pkg.tier);
    if (compatResult.isErr()) {
      await pluginRun.recordError(compatResult.error.message);
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: compatResult.error.message,
        },
      });
    }

    if (body.paygEnabled && !isPaygEligibleTier(pkg.tier)) {
      const errorMessage = `Pay-as-you-go can only be enabled for ${PAYG_ELIGIBLE_TIERS.join(
        " or "
      )} contracts.`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
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
        const errorMessage = "startingAt is not a valid ISO timestamp.";
        await pluginRun.recordError(errorMessage);
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message: errorMessage },
        });
      }
      const ONE_HOUR_MS = 60 * 60 * 1000;
      if (requestedStartMs < Date.now() + ONE_HOUR_MS) {
        const errorMessage =
          "startingAt must be at least one hour in the future.";
        await pluginRun.recordError(errorMessage);
        return apiError(ctx, {
          status_code: 400,
          api_error: { type: "invalid_request_error", message: errorMessage },
        });
      }
      startingAtDate = new Date(requestedStartMs);
      swapAt = "next-hour";
    } else {
      startingAtDate = new Date();
      swapAt = "current-hour";
    }

    const packageAlias = pkg.aliases[0];
    if (!packageAlias) {
      const errorMessage = `Package ${pkg.id} has no alias to switch to.`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 400,
        api_error: { type: "invalid_request_error", message: errorMessage },
      });
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
      const errorMessage = `Failed to provision Metronome contract: ${provisionResult.error.message}`;
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 502,
        api_error: { type: "internal_server_error", message: errorMessage },
      });
    }
    const { metronomeContractId } = provisionResult.value;

    const alignedStart = new Date(
      swapAt === "current-hour"
        ? floorToHourISO(startingAtDate)
        : ceilToHourISO(startingAtDate)
    );

    try {
      await SubscriptionResource.createPendingMetronomeContract({
        workspaceModelId: owner.id,
        planCode: body.planCode,
        metronomeContractId,
        startDate: alignedStart,
      });
    } catch (err) {
      const errorMessage =
        `Provisioned Metronome contract ${metronomeContractId} but failed to ` +
        `create pending subscription: ${err instanceof Error ? err.message : String(err)}. ` +
        "Manual cleanup may be required.";
      await pluginRun.recordError(errorMessage);
      return apiError(ctx, {
        status_code: 502,
        api_error: { type: "internal_server_error", message: errorMessage },
      });
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

    const paygCapMicroUsd =
      body.paygEnabled && body.paygCapDollars !== undefined
        ? Math.round(body.paygCapDollars * 1_000_000)
        : null;
    if (programmaticConfig) {
      const updateResult = await programmaticConfig.updateConfiguration(auth, {
        paygCapMicroUsd,
      });
      if (updateResult.isErr()) {
        const errorMessage = `Failed to update PAYG configuration: ${updateResult.error.message}`;
        await pluginRun.recordError(errorMessage);
        return apiError(ctx, {
          status_code: 500,
          api_error: { type: "internal_server_error", message: errorMessage },
        });
      }
    } else if (paygCapMicroUsd !== null) {
      const createResult = await ProgrammaticUsageConfigurationResource.makeNew(
        auth,
        {
          freeCreditMicroUsd: null,
          defaultDiscountPercent: 0,
          paygCapMicroUsd,
          dailyCapMicroUsd: null,
        }
      );
      if (createResult.isErr()) {
        const errorMessage = `Failed to create PAYG configuration: ${createResult.error.message}`;
        await pluginRun.recordError(errorMessage);
        return apiError(ctx, {
          status_code: 500,
          api_error: { type: "internal_server_error", message: errorMessage },
        });
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

    const paygStatus = body.paygEnabled
      ? ` PAYG enabled with $${body.paygCapDollars} cap.`
      : "";
    await pluginRun.recordResult({
      display: "text",
      value:
        `Workspace ${owner.name} scheduled to switch to plan ${body.planCode} ` +
        `(Metronome contract ${metronomeContractId}). Subscription will flip ` +
        `when the contract.start webhook fires.${paygStatus}`,
    });
    return ctx.json({ success: true });
  }
);

export default app;
