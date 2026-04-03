/** @ignoreswagger */
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import {
  FullTriggerSchema,
  TriggerSchema,
} from "@app/types/assistant/triggers";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";

export const GetTriggersResponseBodySchema = z.object({
  triggers: z.array(
    FullTriggerSchema.and(
      z.object({
        isSubscriber: z.boolean(),
        isEditor: z.boolean(),
        editorName: z.string().optional(),
      })
    )
  ),
});
export type GetTriggersResponseBody = z.infer<
  typeof GetTriggersResponseBodySchema
>;

const DeleteTriggersRequestBodyCodec = z.object({
  triggerIds: z.array(z.string()),
});
export type DeleteTriggersRequestBody = z.infer<
  typeof DeleteTriggersRequestBodyCodec
>;

const PatchTriggersRequestBodyCodec = z.object({
  triggers: z.array(z.object({ sId: z.string() }).and(TriggerSchema)),
});
export type PatchTriggersRequestBody = z.infer<
  typeof PatchTriggersRequestBodyCodec
>;

const PostTriggersRequestBodyCodec = z.object({
  triggers: z.array(TriggerSchema),
});
export type PostTriggersRequestBody = z.infer<
  typeof PostTriggersRequestBodyCodec
>;

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

  if (!agentConfiguration || (!agentConfiguration.canRead && !auth.isAdmin())) {
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
      const editorNamesMap = new Map(
        editorUsers.map((user) => [user.id, user.fullName()])
      );

      const triggersWithIsSubscriber = await Promise.all(
        allTriggers.map(async (trigger) => ({
          ...trigger.toJSON(),
          isSubscriber: await trigger.isSubscriber(auth),
          isEditor: trigger.editor === auth.getNonNullableUser().id,
          editorName: editorNamesMap.get(trigger.editor),
        }))
      );

      return res.status(200).json({
        triggers: triggersWithIsSubscriber,
      });
    }

    case "DELETE": {
      const deleteDecoded = DeleteTriggersRequestBodyCodec.safeParse(req.body);
      if (!deleteDecoded.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${deleteDecoded.error.message}`,
          },
        });
      }

      const { triggerIds } = deleteDecoded.data;
      const workspace = auth.getNonNullableWorkspace();

      // Batch delete triggers
      for (const triggerId of triggerIds) {
        const triggerToDelete = auth.isAdmin()
          ? allTriggers.find((t) => t.sId === triggerId)
          : userTriggers.find((t) => t.sId === triggerId);

        if (!triggerToDelete) {
          // Skip triggers that the user cannot delete
          continue;
        }

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

      res.status(204).end();
      return;
    }

    case "PATCH": {
      const patchDecoded = PatchTriggersRequestBodyCodec.safeParse(req.body);
      if (!patchDecoded.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${patchDecoded.error.message}`,
          },
        });
      }

      const { triggers } = patchDecoded.data;
      const workspace = auth.getNonNullableWorkspace();

      // Batch update triggers
      for (const triggerData of triggers) {
        const triggerToUpdate = auth.isAdmin()
          ? allTriggers.find((t) => t.sId === triggerData.sId)
          : userTriggers.find((t) => t.sId === triggerData.sId);

        if (!triggerToUpdate) {
          continue; // Skip triggers that the user cannot edit
        }

        const triggerValidation = TriggerSchema.safeParse({
          ...triggerData,
          editor: auth.getNonNullableUser().id,
        });

        if (!triggerValidation.success) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid trigger data: ${triggerValidation.error.message}`,
            },
          });
        }

        const validatedTrigger = triggerValidation.data;

        const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
          ? getResourceIdFromSId(validatedTrigger.webhookSourceViewSId)
          : null;

        const updatedTrigger = await TriggerResource.update(
          auth,
          triggerData.sId,
          {
            ...validatedTrigger,
            status: validatedTrigger.status ?? "enabled",
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
      const postDecoded = PostTriggersRequestBodyCodec.safeParse(req.body);
      if (!postDecoded.success) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${postDecoded.error.message}`,
          },
        });
      }

      const { triggers } = postDecoded.data;
      const workspace = auth.getNonNullableWorkspace();

      // Batch create triggers
      for (const triggerData of triggers) {
        const triggerValidation = TriggerSchema.safeParse({
          ...triggerData,
          editor: auth.getNonNullableUser().id,
        });

        if (!triggerValidation.success) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid trigger data: ${triggerValidation.error.message}`,
            },
          });
        }

        const validatedTrigger = triggerValidation.data;

        const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
          ? getResourceIdFromSId(validatedTrigger.webhookSourceViewSId)
          : null;

        const executionPerDay = isWebhookTriggerData(validatedTrigger)
          ? validatedTrigger.executionPerDayLimitOverride
          : null;

        const newTrigger = await TriggerResource.makeNew(auth, {
          workspaceId: workspace.id,
          agentConfigurationId,
          name: validatedTrigger.name,
          kind: validatedTrigger.kind,
          status: validatedTrigger.status ?? "enabled",
          configuration: validatedTrigger.configuration,
          naturalLanguageDescription:
            validatedTrigger.naturalLanguageDescription,
          customPrompt: validatedTrigger.customPrompt,
          editor: auth.getNonNullableUser().id,
          webhookSourceViewId,
          executionPerDayLimitOverride: executionPerDay,
          executionMode:
            validatedTrigger.kind === "webhook" ? "fair_use" : null,
          origin: "user",
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
