import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { PatchAgentTagsResponseBody } from "@app/lib/api/assistant/configuration/agent_tags";
import { TagResource } from "@app/lib/resources/tags_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { isBuilder } from "@app/types/user";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

const PatchAgentTagsRequestBodySchema = z
  .object({
    addTagIds: z.array(z.string()).optional(),
    removeTagIds: z.array(z.string()).optional(),
  })
  .refine(
    (body) =>
      (body.addTagIds?.length ?? 0) > 0 || (body.removeTagIds?.length ?? 0) > 0,
    {
      message:
        "Either addTagIds or removeTagIds must be provided and contain at least one ID.",
    }
  );

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/tags.
const app = workspaceApp();

app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchAgentTagsRequestBodySchema),
  async (ctx): HandlerResult<PatchAgentTagsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    if (!agent.canEdit && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the agent or workspace admins can modify agent.",
        },
      });
    }

    const { addTagIds = [], removeTagIds = [] } = ctx.req.valid("json");

    const tagsToAdd = await TagResource.fetchByIds(auth, addTagIds);
    const tagsToRemove = await TagResource.fetchByIds(auth, removeTagIds);

    if (
      tagsToAdd.length !== addTagIds.length ||
      tagsToRemove.length !== removeTagIds.length
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid tag ids",
        },
      });
    }

    if (
      !isBuilder(auth.getNonNullableWorkspace()) &&
      (tagsToAdd.some((tag) => tag.kind === "protected") ||
        tagsToRemove.some((tag) => tag.kind === "protected"))
    ) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Protected tags cannot be added or removed.",
        },
      });
    }

    await Promise.all([
      concurrentExecutor(tagsToAdd, (tag) => tag.addToAgent(auth, agent), {
        concurrency: 10,
      }),
      concurrentExecutor(
        tagsToRemove,
        (tag) => tag.removeFromAgent(auth, agent),
        { concurrency: 10 }
      ),
    ]);

    const tags = await TagResource.listForAgent(auth, agent.id);

    return ctx.json({ tags: tags.map((t) => t.toJSON()) });
  }
);

export default app;
