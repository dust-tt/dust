import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  TriggerConfiguration,
  TriggerType,
} from "@app/types/assistant/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";

export interface GetTriggersResponseBody {
  triggers: (TriggerType & {
    isSubscriber: boolean;
    isEditor: boolean;
    editorEmail?: string;
  })[];
}

export interface PatchTriggersRequestBody {
  triggers: Array<
    {
      sId?: string;
      name: string;
      customPrompt: string;
    } & TriggerConfiguration
  >;
}

// Helper type guard for decoded trigger data from TriggerSchema
function isWebhookTriggerData(trigger: {
  kind: string;
  webhookSourceViewSId?: unknown;
}): trigger is { kind: "webhook"; webhookSourceViewSId: string } {
  return (
    trigger.kind === "webhook" &&
    typeof trigger.webhookSourceViewSId === "string"
  );
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTriggersResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const agentConfigurationId = req.query.aId;

  if (typeof agentConfigurationId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });

  if (!agentConfiguration || !agentConfiguration.canRead) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  const allTriggers = await TriggerResource.listByAgentConfigurationId(
    auth,
    agentConfigurationId
  );

  const userTriggers = allTriggers.filter(
    (trigger) => trigger.editor === auth.getNonNullableWorkspace().id
  );

  switch (req.method) {
    case "GET": {
      // Fetch all editor users in batch
      const editorIds = [
        ...new Set(allTriggers.map((trigger) => trigger.editor)),
      ];
      const editorUsers = await UserResource.fetchByModelIds(editorIds);
      const editorEmailMap = new Map(
        editorUsers.map((user) => [user.id, user.email])
      );

      const triggersWithIsSubscriber = await Promise.all(
        allTriggers.map(async (trigger) => ({
          ...trigger.toJSON(),
          isSubscriber: await trigger.isSubscriber(auth),
          isEditor: trigger.editor === auth.getNonNullableUser().id,
          editorEmail: editorEmailMap.get(trigger.editor),
        }))
      );

      return res.status(200).json({
        triggers: triggersWithIsSubscriber,
      });
    }

    case "PATCH": {
      if (!agentConfiguration.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can update triggers for this agent.",
          },
        });
      }

      if (
        !req.body ||
        !req.body.triggers ||
        !Array.isArray(req.body.triggers)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Request body must contain a 'triggers' array.",
          },
        });
      }

      const { triggers: requestTriggers } = req.body;
      const workspace = auth.getNonNullableWorkspace();

      if (requestTriggers.length > 0) {
        const triggerNames = [
          ...requestTriggers.map((t: { name: string }) => t.name),
          ...allTriggers.map((t) => t.name),
        ];
        const uniqueTriggerNames = new Set(triggerNames);
        if (uniqueTriggerNames.size !== triggerNames.length) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "Trigger names must be unique for a given agent.",
            },
          });
        }
      }

      const currentTriggersMap = new Map(userTriggers.map((t) => [t.sId(), t]));
      const resultTriggers: TriggerType[] = [];
      const errors: Error[] = [];

      for (const triggerData of requestTriggers) {
        const triggerValidation = TriggerSchema.decode(triggerData);

        if (isLeft(triggerValidation)) {
          const pathError = reporter.formatValidationErrors(
            triggerValidation.left
          );
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid trigger data: ${pathError}`,
            },
          });
        }

        const validatedTrigger = triggerValidation.right;

        if (triggerData.sId && currentTriggersMap.has(triggerData.sId)) {
          const existingTrigger = currentTriggersMap.get(triggerData.sId)!;

          const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
            ? getResourceIdFromSId(validatedTrigger.webhookSourceViewSId)
            : null;

          const updatedTrigger = await TriggerResource.update(
            auth,
            existingTrigger.sId(),
            {
              ...validatedTrigger,
              webhookSourceViewId,
            }
          );
          if (updatedTrigger.isErr()) {
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: "Failed to update trigger.",
              },
            });
          }

          resultTriggers.push(updatedTrigger.value.toJSON());
          currentTriggersMap.delete(triggerData.sId);
        } else {
          const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
            ? getResourceIdFromSId(validatedTrigger.webhookSourceViewSId)
            : null;

          const newTrigger = await TriggerResource.makeNew(auth, {
            workspaceId: workspace.id,
            agentConfigurationId,
            name: validatedTrigger.name,
            kind: validatedTrigger.kind,
            configuration: validatedTrigger.configuration,
            customPrompt: validatedTrigger.customPrompt,
            editor: auth.getNonNullableUser().id,
            webhookSourceViewId,
          });

          if (newTrigger.isErr()) {
            errors.push(newTrigger.error);
            continue;
          }

          resultTriggers.push(newTrigger.value.toJSON());
        }
      }

      for (const [, trigger] of currentTriggersMap) {
        await trigger.delete(auth);
      }

      if (errors.length > 0) {
        logger.error(
          {
            errors: errors.map((e) => e.message),
            workspaceId: workspace.id,
            agentConfigurationId: agentConfiguration.id,
          },
          `Failed to process ${errors.length} triggers.`
        );

        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to process ${errors.length} triggers`,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or PATCH is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
