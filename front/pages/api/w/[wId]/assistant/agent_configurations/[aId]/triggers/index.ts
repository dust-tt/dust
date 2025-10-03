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

export interface DeleteTriggersRequestBody {
  triggerIds: string[];
}

export interface PatchTriggersRequestBody {
  triggers: Array<{
    sId: string;
    name: string;
    customPrompt: string | null;
    configuration: TriggerConfiguration;
    kind: string;
    webhookSourceViewSId?: string;
  }>;
}

export interface PostTriggersRequestBody {
  triggers: Array<{
    name: string;
    customPrompt: string | null;
    configuration: TriggerConfiguration;
    kind: string;
    webhookSourceViewSId?: string;
  }>;
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
    (trigger) => trigger.editor === auth.getNonNullableUser().id
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

    case "DELETE": {
      if (!agentConfiguration.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete triggers for this agent.",
          },
        });
      }

      if (
        !req.body ||
        !req.body.triggerIds ||
        !Array.isArray(req.body.triggerIds)
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Request body must contain a 'triggerIds' array.",
          },
        });
      }

      const { triggerIds } = req.body as DeleteTriggersRequestBody;
      const workspace = auth.getNonNullableWorkspace();

      // Batch delete triggers
      for (const triggerId of triggerIds) {
        const triggerToDelete = userTriggers.find((t) => t.sId() === triggerId);
        if (triggerToDelete) {
          const deleteResult = await triggerToDelete.delete(auth);
          if (deleteResult.isErr()) {
            logger.error(
              {
                workspaceId: workspace.sId,
                agentConfigurationId,
                triggerId,
                error: deleteResult.error,
              },
              "Failed to delete trigger"
            );
            return apiError(req, res, {
              status_code: 500,
              api_error: {
                type: "internal_server_error",
                message: `Failed to delete trigger ${triggerId}.`,
              },
            });
          }
        }
      }

      res.status(204).end();
      return;
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

      const { triggers } = req.body as PatchTriggersRequestBody;
      const workspace = auth.getNonNullableWorkspace();

      // Batch update triggers
      for (const triggerData of triggers) {
        const triggerValidation = TriggerSchema.decode({
          ...triggerData,
          editor: auth.getNonNullableUser().id,
        });

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

        const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
          ? getResourceIdFromSId(validatedTrigger.webhookSourceViewSId)
          : null;

        const updatedTrigger = await TriggerResource.update(
          auth,
          triggerData.sId,
          {
            ...validatedTrigger,
            webhookSourceViewId,
          }
        );

        if (updatedTrigger.isErr()) {
          logger.error(
            {
              workspaceId: workspace.sId,
              agentConfigurationId,
              triggerId: triggerData.sId,
              error: updatedTrigger.error,
            },
            "Failed to update trigger"
          );
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to update trigger ${triggerData.name}.`,
            },
          });
        }
      }

      res.status(204).end();
      return;
    }

    case "POST": {
      if (!agentConfiguration.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can create triggers for this agent.",
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

      const { triggers } = req.body as PostTriggersRequestBody;
      const workspace = auth.getNonNullableWorkspace();

      // Batch create triggers
      for (const triggerData of triggers) {
        const triggerValidation = TriggerSchema.decode({
          ...triggerData,
          editor: auth.getNonNullableUser().id,
        });

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
          logger.error(
            {
              workspaceId: workspace.sId,
              agentConfigurationId,
              triggerName: validatedTrigger.name,
              error: newTrigger.error,
            },
            "Failed to create trigger"
          );
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: `Failed to create trigger ${validatedTrigger.name}.`,
            },
          });
        }
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
            "The method passed is not supported, GET, POST, PATCH, or DELETE is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
