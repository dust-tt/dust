import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import logger from "@app/logger/logger";
import type { GetTriggersResponseBody } from "@app/types/api/assistant/configuration/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tId from "./[tId]";

const ParamsSchema = z.object({
  aId: z.string(),
});

const DeleteTriggersRequestBodySchema = z.object({
  triggerIds: z.array(z.string()),
});

const PatchTriggersRequestBodySchema = z.object({
  triggers: z.array(z.object({ sId: z.string() }).and(TriggerSchema)),
});

const PostTriggersRequestBodySchema = z.object({
  triggers: z.array(TriggerSchema),
});

function isWebhookTriggerData(trigger: {
  kind: string;
  webhookSourceViewId?: unknown;
}): trigger is { kind: "webhook"; webhookSourceViewId: string } {
  return (
    trigger.kind === "webhook" &&
    typeof trigger.webhookSourceViewId === "string"
  );
}

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/triggers.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetTriggersResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (
      !agentConfiguration ||
      (!agentConfiguration.canRead && !auth.isAdmin())
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    const allTriggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      aId
    );

    const editorIds = [
      ...new Set(allTriggers.map((trigger) => trigger.editor)),
    ];
    const editorUsers = await UserResource.fetchByModelIds(editorIds);
    const editorNamesMap = new Map(
      editorUsers.map((user) => [user.id, user.fullName()])
    );

    const triggers = allTriggers.map((trigger) => ({
      ...trigger.toJSON(),
      isEditor: trigger.editor === auth.getNonNullableUser().id,
      editorName: editorNamesMap.get(trigger.editor),
    }));

    return ctx.json({ triggers });
  }
);

app.delete(
  "/",
  validate("param", ParamsSchema),
  validate("json", DeleteTriggersRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (
      !agentConfiguration ||
      (!agentConfiguration.canRead && !auth.isAdmin())
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    const allTriggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      aId
    );
    const userTriggers = allTriggers.filter(
      (trigger) => trigger.editor === auth.getNonNullableUser().id
    );

    const { triggerIds } = ctx.req.valid("json");
    const workspace = auth.getNonNullableWorkspace();

    for (const triggerId of triggerIds) {
      const triggerToDelete = auth.isAdmin()
        ? allTriggers.find((t) => t.sId === triggerId)
        : userTriggers.find((t) => t.sId === triggerId);

      if (!triggerToDelete) {
        continue;
      }

      const deleteResult = await triggerToDelete.delete(auth);
      if (deleteResult.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            agentConfigurationId: aId,
            triggerId,
            error: deleteResult.error,
          },
          "Failed to delete trigger"
        );
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to delete trigger ${triggerId}.`,
          },
        });
      }
    }

    return ctx.body(null, 204);
  }
);

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchTriggersRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (
      !agentConfiguration ||
      (!agentConfiguration.canRead && !auth.isAdmin())
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    const allTriggers = await TriggerResource.listByAgentConfigurationId(
      auth,
      aId
    );
    const userTriggers = allTriggers.filter(
      (trigger) => trigger.editor === auth.getNonNullableUser().id
    );

    const { triggers } = ctx.req.valid("json");
    const workspace = auth.getNonNullableWorkspace();

    for (const triggerData of triggers) {
      const triggerToUpdate = userTriggers.find(
        (t) => t.sId === triggerData.sId
      );
      if (!triggerToUpdate) {
        continue;
      }

      const triggerValidation = TriggerSchema.safeParse({
        ...triggerData,
        editor: triggerToUpdate.editor,
      });
      if (!triggerValidation.success) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid trigger data: ${triggerValidation.error.message}`,
          },
        });
      }

      const validatedTrigger = triggerValidation.data;
      const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
        ? getResourceIdFromSId(validatedTrigger.webhookSourceViewId)
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
            agentConfigurationId: aId,
            triggerId: triggerData.sId,
            error: updatedTrigger.error,
          },
          "Failed to update trigger"
        );
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to update trigger ${triggerData.name}.`,
          },
        });
      }
    }

    return ctx.body(null, 204);
  }
);

app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", PostTriggersRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (
      !agentConfiguration ||
      (!agentConfiguration.canRead && !auth.isAdmin())
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    const { triggers } = ctx.req.valid("json");
    const workspace = auth.getNonNullableWorkspace();

    for (const triggerData of triggers) {
      const triggerValidation = TriggerSchema.safeParse({
        ...triggerData,
        editor: auth.getNonNullableUser().id,
      });
      if (!triggerValidation.success) {
        return apiError(ctx, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid trigger data: ${triggerValidation.error.message}`,
          },
        });
      }

      const validatedTrigger = triggerValidation.data;
      const webhookSourceViewId = isWebhookTriggerData(validatedTrigger)
        ? getResourceIdFromSId(validatedTrigger.webhookSourceViewId)
        : null;
      const executionPerDay = isWebhookTriggerData(validatedTrigger)
        ? validatedTrigger.executionPerDayLimitOverride
        : null;

      const newTrigger = await TriggerResource.makeNew(auth, {
        workspaceId: workspace.id,
        agentConfigurationId: aId,
        name: validatedTrigger.name,
        kind: validatedTrigger.kind,
        status: validatedTrigger.status ?? "enabled",
        configuration: validatedTrigger.configuration,
        naturalLanguageDescription: validatedTrigger.naturalLanguageDescription,
        customPrompt: validatedTrigger.customPrompt,
        editor: auth.getNonNullableUser().id,
        webhookSourceViewId,
        executionPerDayLimitOverride: executionPerDay,
        executionMode: validatedTrigger.kind === "webhook" ? "fair_use" : null,
        origin: "user",
      });

      if (newTrigger.isErr()) {
        logger.error(
          {
            workspaceId: workspace.sId,
            agentConfigurationId: aId,
            triggerName: validatedTrigger.name,
            error: newTrigger.error,
          },
          "Failed to create trigger"
        );
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to create trigger ${validatedTrigger.name}.`,
          },
        });
      }
    }

    return ctx.body(null, 204);
  }
);

app.route("/:tId", tId);

export default app;
