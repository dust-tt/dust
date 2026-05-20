import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { TagResource } from "@app/lib/resources/tags_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const BatchUpdateAgentTagsRequestBodySchema = z.object({
  agentIds: z.array(z.string()),
  addTagIds: z.array(z.string()).optional(),
  removeTagIds: z.array(z.string()).optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/batch_update_tags.
const app = new Hono();

app.post(
  "/",
  validate("json", BatchUpdateAgentTagsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");
    const { agentIds, addTagIds = [], removeTagIds = [] } = ctx.req.valid("json");

    const tagsToAdd = await TagResource.fetchByIds(auth, addTagIds);
    const tagsToRemove = await TagResource.fetchByIds(auth, removeTagIds);

    if (
      tagsToAdd.length !== addTagIds.length ||
      tagsToRemove.length !== removeTagIds.length
    ) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "One or more specified tags were not found.",
        },
      });
    }

    await concurrentExecutor(
      agentIds,
      async (agentId) => {
        const agent = await getAgentConfiguration(auth, {
          agentId,
          variant: "light",
        });
        if (!agent) {
          return;
        }
        if (!agent.canEdit && !auth.isAdmin()) {
          return;
        }
        for (const tag of tagsToAdd) {
          await tag.addToAgent(auth, agent);
        }
        for (const tag of tagsToRemove) {
          await tag.removeFromAgent(auth, agent);
        }
      },
      { concurrency: 10 }
    );

    return ctx.json({ success: true });
  }
);

export default app;
