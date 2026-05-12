/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import {
  isMetronomeBillingEnabled,
  restoreWorkspaceAfterSubscription,
} from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  ceilToHourISO,
  createMetronomeContract,
  listMetronomeContracts,
  listMetronomePackages,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import {
  ensureMetronomeCustomerForWorkspace,
  switchMetronomeContractPackage,
} from "@app/lib/metronome/contracts";
import { invalidateContractCache } from "@app/lib/metronome/plan_type";
import type { MetronomePackageTier } from "@app/lib/metronome/types";
import {
  isEntreprisePlanPrefix,
  isProPlanPrefix,
  PRO_PLAN_SEAT_39_CODE,
} from "@app/lib/plans/plan_codes";
import { getStripeCustomer } from "@app/lib/plans/stripe";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import type { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { fromError } from "zod-validation-error";

export interface SwitchContractSuccessResponseBody {
  success: boolean;
}

const SwitchContractBodySchema = z.object({
  planCode: z.string().min(1),
  metronomePackageId: z.string().min(1),
  // ISO timestamp. Required and validated to be ≥1h in the future when the
  // selected package is enterprise-tier; forbidden otherwise (Pro/Business
  // swap at the current hour).
  startingAt: z.string().optional(),
  stripeCustomerId: z.string().min(1),
});

type PlanTier = MetronomePackageTier | "free";

function classifyPlanCode(planCode: string): PlanTier {
  if (isEntreprisePlanPrefix(planCode)) {
    return "enterprise";
  }
  if (planCode === PRO_PLAN_SEAT_39_CODE) {
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
  if (planTier === "free") {
    return new Err(
      new Error(
        `Plan ${planCode} is a free plan; the switch-contract flow only ` +
          "handles paid plans. Use the dedicated free-plan action instead."
      )
    );
  }
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<SwitchContractSuccessResponseBody>>,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "Could not find the user.",
      },
    });
  }

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "Could not find the workspace.",
      },
    });
  }

  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const plugin = pluginManager.getNonNullablePlugin("switch-contract");
  const pluginRun = await PluginRunResource.makeNew(
    plugin,
    req.body,
    auth.getNonNullableUser(),
    owner,
    { resourceId: owner.sId, resourceType: "workspaces" }
  );

  const validation = SwitchContractBodySchema.safeParse(req.body);
  if (!validation.success) {
    const errorMessage = `The request body is invalid: ${fromError(validation.error).toString()}`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
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
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }

  // PAYG on the Metronome path is not yet wired up — reject before touching
  // any state.
  const programmaticConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  if (programmaticConfig?.paygCapMicroUsd != null) {
    const errorMessage =
      "Pay-as-you-go is not yet supported for Metronome-billed subscriptions. " +
      "Disable PAYG via the 'Manage Programmatic Usage Configuration' plugin first.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }

  // Validate the Stripe customer exists before we touch Metronome.
  const stripeCustomer = await getStripeCustomer(body.stripeCustomerId);
  if (!stripeCustomer) {
    const errorMessage = `Stripe customer not found: ${body.stripeCustomerId}.`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }

  // Resolve the Metronome customer.
  const customerResult = await ensureMetronomeCustomerForWorkspace({
    workspace: renderLightWorkspaceType({ workspace: owner }),
    stripeCustomerId: body.stripeCustomerId,
  });
  if (customerResult.isErr()) {
    const errorMessage = `Failed to ensure Metronome customer: ${customerResult.error.message}`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 502,
      api_error: { type: "internal_server_error", message: errorMessage },
    });
  }
  const { metronomeCustomerId } = customerResult.value;

  // Resolve the package and classify its tier.
  const packagesResult = await listMetronomePackages();
  if (packagesResult.isErr()) {
    const errorMessage = `Failed to list Metronome packages: ${packagesResult.error.message}`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
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
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }
  // Plan ↔ package tier compatibility.
  const compatResult = validatePlanPackageCompat(body.planCode, pkg.tier);
  if (compatResult.isErr()) {
    await pluginRun.recordError(compatResult.error.message);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: compatResult.error.message,
      },
    });
  }

  // Branch on tier — enterprise schedules in the future, pro/business swap now.
  if (pkg.tier === "enterprise") {
    return handleEnterpriseSwitch({
      req,
      res,
      pluginRun,
      owner,
      body,
      pkg,
      metronomeCustomerId,
    });
  }

  if (!currentSubscription) {
    const errorMessage = "Workspace has no active subscription to switch from.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }

  return handleProOrBusinessSwitch({
    req,
    res,
    pluginRun,
    auth,
    owner,
    body,
    pkg,
    metronomeCustomerId,
    currentSubscription,
  });
}

async function handleEnterpriseSwitch({
  req,
  res,
  pluginRun,
  owner,
  body,
  pkg,
  metronomeCustomerId,
}: {
  req: NextApiRequest;
  res: NextApiResponse<WithAPIErrorResponse<SwitchContractSuccessResponseBody>>;
  pluginRun: PluginRunResource;
  owner: ReturnType<Authenticator["workspace"]>;
  body: z.infer<typeof SwitchContractBodySchema>;
  pkg: { id: string; name: string };
  metronomeCustomerId: string;
}): Promise<void> {
  if (!body.startingAt) {
    const errorMessage =
      "startingAt is required for enterprise packages and must be at least " +
      "one hour in the future.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }
  const ONE_HOUR_MS = 60 * 60 * 1000;
  const requestedStartMs = Date.parse(body.startingAt);
  if (Number.isNaN(requestedStartMs)) {
    const errorMessage = "startingAt is not a valid ISO timestamp.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }
  if (requestedStartMs < Date.now() + ONE_HOUR_MS) {
    const errorMessage = "startingAt must be at least one hour in the future.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }

  const startingAtDate = new Date(ceilToHourISO(new Date(requestedStartMs)));

  const createResult = await createMetronomeContract({
    metronomeCustomerId,
    packageId: pkg.id,
    uniquenessKey: `switch-contract:${metronomeCustomerId}:${pkg.id}:${body.planCode}:${startingAtDate.toISOString()}`,
    startingAt: startingAtDate,
    enableStripeBilling: true,
    planCode: body.planCode,
  });
  if (createResult.isErr()) {
    const errorMessage = `Failed to create Metronome contract: ${createResult.error.message}`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 502,
      api_error: { type: "internal_server_error", message: errorMessage },
    });
  }
  const newMetronomeContractId = createResult.value.contractId;

  // Sunset any non-archived contract that overlaps with our new contract's
  // window. Same logic as upgrade_enterprise.ts.
  const contractsResult = await listMetronomeContracts(metronomeCustomerId);
  if (contractsResult.isErr()) {
    const errorMessage =
      `Created new contract ${newMetronomeContractId} but failed to list ` +
      `existing contracts to sunset: ${contractsResult.error.message}. ` +
      "Manual cleanup may be required.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 502,
      api_error: { type: "internal_server_error", message: errorMessage },
    });
  }

  const newStartMs = startingAtDate.getTime();
  for (const existing of contractsResult.value) {
    if (existing.id === newMetronomeContractId) {
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
      endingBefore: startingAtDate,
    });
    if (sunsetResult.isErr()) {
      const errorMessage =
        `Created new contract ${newMetronomeContractId} but failed to sunset ` +
        `existing contract ${existing.id}: ${sunsetResult.error.message}. ` +
        "Manual cleanup may be required.";
      await pluginRun.recordError(errorMessage);
      return apiError(req, res, {
        status_code: 502,
        api_error: { type: "internal_server_error", message: errorMessage },
      });
    }
  }

  await pluginRun.recordResult({
    display: "text",
    value:
      `Workspace ${owner!.name} scheduled to switch to plan ${body.planCode} ` +
      `at ${startingAtDate.toISOString()} (Metronome contract ${newMetronomeContractId}). ` +
      "Subscription will flip when the contract.start webhook fires.",
  });
  res.status(200).json({ success: true });
}

async function handleProOrBusinessSwitch({
  req,
  res,
  pluginRun,
  auth,
  owner,
  body,
  pkg,
  metronomeCustomerId,
  currentSubscription,
}: {
  req: NextApiRequest;
  res: NextApiResponse<WithAPIErrorResponse<SwitchContractSuccessResponseBody>>;
  pluginRun: PluginRunResource;
  auth: Authenticator;
  owner: ReturnType<Authenticator["workspace"]>;
  body: z.infer<typeof SwitchContractBodySchema>;
  pkg: { id: string; name: string; aliases: string[] };
  metronomeCustomerId: string;
  currentSubscription: SubscriptionResource;
}): Promise<void> {
  if (body.startingAt) {
    const errorMessage =
      "startingAt is not supported for Pro/Business packages — they swap at " +
      "the current hour boundary. Omit the field.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }

  // Pro/Business packages are picked by alias for switchMetronomeContractPackage.
  // Pick the first known alias on the package (the legacy aliases are 1:1
  // with packages in metronome_setup.ts).
  const packageAlias = pkg.aliases[0];
  if (!packageAlias) {
    const errorMessage = `Package ${pkg.id} has no alias to switch to.`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 400,
      api_error: { type: "invalid_request_error", message: errorMessage },
    });
  }

  // When the workspace has no Metronome contract yet, fall through to the
  // same call with `oldContractId: null` — `switchMetronomeContractPackage`
  // skips the end-of-old step and just creates the first contract.
  const currentMetronomeContractId =
    currentSubscription.metronomeContractId ?? null;

  const switchResult = await switchMetronomeContractPackage({
    metronomeCustomerId,
    oldContractId: currentMetronomeContractId,
    workspace: renderLightWorkspaceType({ workspace: owner! }),
    packageAlias,
    enableStripeBilling: true,
    planCode: body.planCode,
    swapAt: "current-hour",
  });
  if (switchResult.isErr()) {
    const errorMessage = `Failed to switch Metronome contract: ${switchResult.error.message}`;
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 502,
      api_error: { type: "internal_server_error", message: errorMessage },
    });
  }
  const { metronomeContractId: newMetronomeContractId } = switchResult.value;

  // Sync DB flip: end old subscription, create new on the target plan
  // pointing at the new contract. Mirrors the contract.start webhook handler.
  try {
    await currentSubscription.swapMetronomeContract({
      metronomeContractId: newMetronomeContractId,
      planCode: body.planCode,
    });
  } catch (err) {
    const errorMessage =
      `Switched Metronome contract to ${newMetronomeContractId} but failed ` +
      `to update the DB subscription: ${err instanceof Error ? err.message : String(err)}. ` +
      "Manual cleanup may be required.";
    await pluginRun.recordError(errorMessage);
    return apiError(req, res, {
      status_code: 502,
      api_error: { type: "internal_server_error", message: errorMessage },
    });
  }
  await invalidateContractCache(owner!.sId);
  await restoreWorkspaceAfterSubscription(auth);

  logger.info(
    {
      workspaceId: owner!.sId,
      planCode: body.planCode,
      metronomeContractId: newMetronomeContractId,
    },
    "[Poke] Workspace switched to Pro/Business plan via switch_contract"
  );

  await pluginRun.recordResult({
    display: "text",
    value:
      `Workspace ${owner!.name} switched to plan ${body.planCode} ` +
      `(Metronome contract ${newMetronomeContractId}).`,
  });
  res.status(200).json({ success: true });
}

export default withSessionAuthenticationForPoke(handler);
