import { AgentResource } from "@app/lib/resources/agent_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const BatchUpdateAgentTagsRequestBodySchema = z.object({
  agentIds: z.array(z.string()),
  addTagIds: z.array(z.string()).optional(),
  removeTagIds: z.array(z.string()).optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/batch_update_tags.
const app = workspaceApp();

/** @ignoreswagger */
app.post(
  "/",
  validate("json", BatchUpdateAgentTagsRequestBodySchema),
  async (ctx) => {
    const auth = ctx.get("auth");

    const isSaveAgentConfigurationsEnabled =
      await KillSwitchResource.isKillSwitchEnabled("save_agent_configurations");
    if (isSaveAgentConfigurationsEnabled) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "app_auth_error",
          message:
            "Saving agent configurations is temporarily disabled, try again later.",
        },
      });
    }

    const {
      agentIds,
      addTagIds = [],
      removeTagIds = [],
    } = ctx.req.valid("json");

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

    // Tagging is applied per agent as a new version through `bulkUpdate`: each agent keeps its other
    // tags, an unchanged set is a no-op, and every agent is gated on `write`/`admin` (see the
    // `tags-change-requires-edit` contract). Admins may thus tag any agent of the workspace,
    // including the ones built on spaces they cannot read (the manage agents page lists those behind
    // "Show hidden agents"); agents the caller cannot edit or that are archived are skipped.
    const { updatedAgentIds, skippedAgentIds } = await AgentResource.bulkUpdate(
      auth,
      agentIds,
      {
        addTags: tagsToAdd.map((tag) => tag.toJSON()),
        removeTags: tagsToRemove.map((tag) => tag.toJSON()),
      }
    );

    return ctx.json({ success: true, updatedAgentIds, skippedAgentIds });
  }
);

export default app;
