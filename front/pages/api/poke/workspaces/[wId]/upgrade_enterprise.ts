/** @ignoreswagger */
import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { pluginManager } from "@app/lib/api/poke/plugin_manager";
import {
  ProgrammaticUsageConfigurationSchema,
  upsertProgrammaticUsageConfiguration,
} from "@app/lib/api/poke/plugins/workspaces/manage_programmatic_usage_configuration";
import { restoreWorkspaceAfterSubscription } from "@app/lib/api/subscription";
import { Authenticator } from "@app/lib/auth";
import { startOrResumeEnterprisePAYG } from "@app/lib/credits/payg";
import type { SessionWithUser } from "@app/lib/iam/provider";
import {
  ceilToHourISO,
  createMetronomeContract,
  findMetronomeCustomerByAlias,
  listMetronomeContracts,
  listMetronomePackages,
  scheduleMetronomeContractEnd,
  setMetronomeContractCustomFields,
} from "@app/lib/metronome/client";
import { PLAN_CODE_CUSTOM_FIELD_KEY } from "@app/lib/metronome/constants";
import { isEntreprisePlanPrefix } from "@app/lib/plans/plan_codes";
import {
  assertStripeSubscriptionIsValid,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { PluginRunResource } from "@app/lib/resources/plugin_run_resource";
import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { EnterpriseUpgradeFormSchema } from "@app/types/plan";
import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export interface UpgradeEnterpriseSuccessResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<UpgradeEnterpriseSuccessResponseBody>
  >,
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

  switch (req.method) {
    case "POST":
      const plugin = pluginManager.getNonNullablePlugin(
        "upgrade-enterprise-plan"
      );
      const pluginRun = await PluginRunResource.makeNew(
        plugin,
        req.body,
        auth.getNonNullableUser(),
        owner,
        {
          resourceId: owner.sId,
          resourceType: "workspaces",
        }
      );

      const bodyValidation = EnterpriseUpgradeFormSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        const errorMessage = `The request body is invalid: ${pathError}`;
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }
      const body = bodyValidation.right;

      const programmaticConfigValidation =
        ProgrammaticUsageConfigurationSchema.safeParse(body);
      if (!programmaticConfigValidation.success) {
        const errorMessage = programmaticConfigValidation.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      const {
        freeCreditsOverrideEnabled,
        freeCreditsDollars,
        defaultDiscountPercent,
        paygEnabled,
        paygCapDollars,
      } = programmaticConfigValidation.data;

      const freeCreditMicroUsd =
        freeCreditsOverrideEnabled && freeCreditsDollars
          ? Math.round(freeCreditsDollars * 1_000_000)
          : null;

      const paygCapMicroUsd =
        paygEnabled && paygCapDollars
          ? Math.round(paygCapDollars * 1_000_000)
          : null;

      const currentSubscription = auth.subscriptionResource();
      const isCurrentSubscriptionMetronomeBilled =
        currentSubscription?.isMetronomeOnlyBilled ?? false;
      const requestedMetronomeUpgrade =
        body.metronomePackageId !== undefined || body.startingAt !== undefined;

      // Metronome path: schedule the upgrade in Metronome. The subscription
      // DB record is updated later by the contract.start webhook.
      if (requestedMetronomeUpgrade || isCurrentSubscriptionMetronomeBilled) {
        if (!body.metronomePackageId || !body.startingAt) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "metronomePackageId and startingAt are required for Metronome-billed subscriptions.",
            },
          });
        }

        if (!isEntreprisePlanPrefix(body.planCode)) {
          const errorMessage = `Plan ${body.planCode} is not an enterprise plan.`;
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: { type: "invalid_request_error", message: errorMessage },
          });
        }

        // Gate: only allow this flow for workspaces whose current subscription
        // is Metronome-only billed. Running it on a free or Stripe-billed
        // subscription would leave the workspace in a shadow-billed or
        // orphaned state when the contract.start webhook swaps the subscription.
        if (!isCurrentSubscriptionMetronomeBilled) {
          const errorMessage =
            "Workspace's current subscription is not Metronome-only billed. " +
            "Migrate the workspace to Metronome billing before scheduling an Enterprise upgrade.";
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: { type: "invalid_request_error", message: errorMessage },
          });
        }

        const customerResult = await findMetronomeCustomerByAlias(owner.sId);
        if (customerResult.isErr() || !customerResult.value) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "No Metronome customer found for this workspace.",
            },
          });
        }

        const metronomeCustomerId = customerResult.value;

        const ONE_HOUR_MS = 60 * 60 * 1000;
        const requestedStartMs = Date.parse(body.startingAt);
        if (Number.isNaN(requestedStartMs)) {
          const errorMessage = "startingAt is not a valid ISO timestamp.";
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: errorMessage,
            },
          });
        }

        if (requestedStartMs < Date.now() + ONE_HOUR_MS) {
          const errorMessage =
            "startingAt must be at least one hour in the future.";
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: errorMessage,
            },
          });
        }

        // Metronome requires hour-aligned timestamps.
        const startingAtDate = new Date(
          ceilToHourISO(new Date(requestedStartMs))
        );

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
            api_error: {
              type: "invalid_request_error",
              message: errorMessage,
            },
          });
        }

        const createResult = await createMetronomeContract({
          metronomeCustomerId,
          packageId: pkg.id,
          startingAt: startingAtDate,
        });
        if (createResult.isErr()) {
          const errorMessage = `Failed to create Metronome contract: ${createResult.error.message}`;
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 502,
            api_error: {
              type: "internal_server_error",
              message: errorMessage,
            },
          });
        }

        const newMetronomeContractId = createResult.value.contractId;

        // Stamp the target plan code on the new contract so the contract.start
        // webhook can determine which plan to put the subscription on.
        const customFieldsResult = await setMetronomeContractCustomFields({
          contractId: newMetronomeContractId,
          customFields: { [PLAN_CODE_CUSTOM_FIELD_KEY]: body.planCode },
        });
        if (customFieldsResult.isErr()) {
          const errorMessage =
            `Created contract ${newMetronomeContractId} but failed to set ` +
            `${PLAN_CODE_CUSTOM_FIELD_KEY}: ${customFieldsResult.error.message}. Manual cleanup required in Metronome.`;
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 502,
            api_error: {
              type: "internal_server_error",
              message: errorMessage,
            },
          });
        }

        // Sunset any other non-archived contract on this customer that
        // overlaps with our new contract's window. We list all contracts
        // because `getMetronomeActiveContract` returns "the most recent",
        // which is usually our just-created contract — masking the running
        // one.
        const contractsResult =
          await listMetronomeContracts(metronomeCustomerId);
        if (contractsResult.isErr()) {
          const errorMessage =
            `Created new contract ${newMetronomeContractId} but failed to list ` +
            `existing contracts to sunset: ${contractsResult.error.message}. ` +
            `Manual cleanup may be required.`;
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
          // Future-scheduled contracts that start after ours: leave them alone
          // (sunsetting a contract to before it starts would be invalid).
          const existingStartMs = new Date(existing.starting_at).getTime();
          if (existingStartMs > newStartMs) {
            continue;
          }
          // Already ends in time — nothing to do.
          const existingEndsBeforeMs = existing.ending_before
            ? new Date(existing.ending_before).getTime()
            : null;
          if (
            existingEndsBeforeMs !== null &&
            existingEndsBeforeMs <= newStartMs
          ) {
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
              `Manual cleanup may be required.`;
            await pluginRun.recordError(errorMessage);
            return apiError(req, res, {
              status_code: 502,
              api_error: {
                type: "internal_server_error",
                message: errorMessage,
              },
            });
          }
        }

        // Programmatic-usage configuration is intentionally not touched on
        // the Metronome path: the dialog hides the section, so unrendered
        // form defaults could otherwise overwrite an existing config.

        await pluginRun.recordResult({
          display: "text",
          value:
            `Workspace ${owner.name} scheduled to upgrade to enterprise plan ${body.planCode} ` +
            `at ${startingAtDate.toISOString()} (Metronome contract ${newMetronomeContractId}). ` +
            `Subscription will flip when the contract.start webhook fires.`,
        });

        res.status(200).json({ success: true });
        return;
      }

      let stripeSubscription = null;
      if (!requestedMetronomeUpgrade) {
        if (!body.stripeSubscriptionId) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message:
                "stripeSubscriptionId is required for Stripe-billed subscriptions.",
            },
          });
        }

        stripeSubscription = await getStripeSubscription(
          body.stripeSubscriptionId
        );
        if (!stripeSubscription) {
          const errorMessage = "The Stripe subscription does not exist.";
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: errorMessage,
            },
          });
        }

        // Ensure the stripe subscription ID has not been used before (same or different workspace).
        const isAlreadyUsed = await SubscriptionResource.isStripeIdAlreadyUsed(
          stripeSubscription.id
        );

        if (isAlreadyUsed) {
          const errorMessage =
            "The Stripe subscription ID is already used by an existing subscription.";
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: errorMessage,
            },
          });
        }

        if (!isEnterpriseSubscription(stripeSubscription)) {
          const errorMessage =
            "The subscription provided is not an enterprise subscription.";
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: errorMessage,
            },
          });
        }

        const assertValidSubscription =
          assertStripeSubscriptionIsValid(stripeSubscription);
        if (assertValidSubscription.isErr()) {
          const errorMessage = assertValidSubscription.error.invalidity_message;
          await pluginRun.recordError(errorMessage);
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: errorMessage,
            },
          });
        }
      }

      const upsertResult = await upsertProgrammaticUsageConfiguration(auth, {
        freeCreditMicroUsd,
        defaultDiscountPercent: defaultDiscountPercent ?? 0,
        paygCapMicroUsd,
      });
      if (upsertResult.isErr()) {
        const errorMessage = upsertResult.error.message;
        await pluginRun.recordError(errorMessage);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorMessage,
          },
        });
      }

      try {
        await SubscriptionResource.pokeUpgradeWorkspaceToEnterprise(
          auth,
          body,
          stripeSubscription
        );
        // Restore workspace functionality after subscription upgrade
        await restoreWorkspaceAfterSubscription(auth);

        // If PAYG is enabled, create the PAYG credit for the current billing period
        if (
          !requestedMetronomeUpgrade &&
          stripeSubscription &&
          paygEnabled &&
          paygCapMicroUsd !== null
        ) {
          const paygResult = await startOrResumeEnterprisePAYG({
            auth,
            stripeSubscription,
            paygCapMicroUsd,
          });
          if (paygResult.isErr()) {
            const errorMessage = paygResult.error.message;
            await pluginRun.recordError(
              `Workspace upgraded but PAYG credit creation failed: ${errorMessage}`
            );
            return apiError(req, res, {
              status_code: 400,
              api_error: {
                type: "invalid_request_error",
                message: `Workspace upgraded but PAYG credit creation failed: ${errorMessage}`,
              },
            });
          }
        }
      } catch (error) {
        const errorString =
          error instanceof Error
            ? error.message
            : JSON.stringify(error, null, 2);
        await pluginRun.recordError(errorString);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: errorString,
          },
        });
      }

      const paygStatus = paygEnabled
        ? `PAYG enabled with $${paygCapDollars} cap.`
        : "PAYG disabled.";
      await pluginRun.recordResult({
        display: "text",
        value: `Workspace ${owner.name} upgraded to enterprise. ${paygStatus}`,
      });

      res.status(200).json({
        success: true,
      });
      break;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
