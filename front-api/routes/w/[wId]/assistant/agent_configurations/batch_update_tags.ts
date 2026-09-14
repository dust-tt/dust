import { shadowEditableAgents } from "@app/lib/api/assistant/agent_permissions";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { TagResource } from "@app/lib/resources/tags_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  ARCHIVED_AGENT_API_ERROR,
  isArchivedAgents,
} from "@front-api/routes/w/[wId]/assistant/agent_configurations/guards";
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

    // Admins may tag any agent of the workspace, including the ones built on spaces they cannot
    // read (the manage agents page lists those behind "Show hidden agents"). Tagging touches
    // nothing the spaces protect.
    const agents = await getAgentConfigurations(auth, {
      agentIds,
      variant: "light",
      dangerouslySkipPermissionFiltering: auth.isAdmin(),
    });
    if (isArchivedAgents(agents)) {
      return apiError(ctx, ARCHIVED_AGENT_API_ERROR);
    }

    const editableAgents = await shadowEditableAgents(
      auth,
      agents,
      agents.filter((agent) => agent.canEdit || auth.isAdmin()),
      "batchUpdateAgentTags"
    );

    const addTagsResult = await TagResource.addToAgents(
      auth,
      tagsToAdd,
      editableAgents
    );
    if (addTagsResult.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: addTagsResult.error.message,
          },
        },
        addTagsResult.error
      );
    }

    const removeTagsResult = await TagResource.removeFromAgents(
      auth,
      tagsToRemove,
      editableAgents
    );
    if (removeTagsResult.isErr()) {
      return apiError(
        ctx,
        {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: removeTagsResult.error.message,
          },
        },
        removeTagsResult.error
      );
    }

    return ctx.json({ success: true });
  }
);

export default app;
