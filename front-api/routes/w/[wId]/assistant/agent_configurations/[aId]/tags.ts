import { AgentResource } from "@app/lib/resources/agent_resource";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { PatchAgentTagsResponseBody } from "@app/types/api/assistant/configuration/agent_tags";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import {
  ARCHIVED_AGENT_API_ERROR,
  isArchivedAgent,
} from "@front-api/routes/w/[wId]/assistant/agent_configurations/guards";
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

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchAgentTagsRequestBodySchema),
  async (ctx): HandlerResult<PatchAgentTagsResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const isSaveAgentConfigurationsDisabled =
      await KillSwitchResource.isKillSwitchEnabled("save_agent_configurations");
    if (isSaveAgentConfigurationsDisabled) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "app_auth_error",
          message:
            "Saving agent configurations is temporarily disabled, try again later.",
        },
      });
    }

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    if (!auth.can("write", agent) && !auth.isAdmin()) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "agent_group_permission_error",
          message:
            "Only editors of the agent or workspace admins can modify agent.",
        },
      });
    }

    if (isArchivedAgent(agent)) {
      return apiError(ctx, ARCHIVED_AGENT_API_ERROR);
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
      !auth.hasWorkspacePermission("publish", "agent") &&
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

    // The tag change is persisted as a new agent version through `AgentResource.bulkUpdate` (the
    // single agent-mutation path, which invalidates the cache and reindexes): each delta resolves
    // against the current tag set, so the other tags are kept, and the write is gated on
    // `write`/`admin` per the `tags-change-requires-edit` contract.
    await AgentResource.bulkUpdate(auth, [agent.sId], {
      addTags: tagsToAdd,
      removeTags: tagsToRemove,
    });

    // Re-read the current version to return the tags of the version just created (tag associations
    // are per-version, so `agent.agentConfigurationModelId` above points at the previous version's
    // row).
    const updatedAgent = await AgentResource.fetchById(auth, aId);
    const tags = updatedAgent ? await updatedAgent.listTags(auth) : [];

    return ctx.json({ tags: tags.map((t) => t.toJSON()) });
  }
);

export default app;
