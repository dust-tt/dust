import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { TagResource } from "@app/lib/resources/tags_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { isBuilder } from "@app/types/user";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

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
const app = new Hono();

app.patch("/", validate("json", PatchAgentTagsRequestBodySchema), async (c) => {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";

  const agent = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agent) {
    return apiError(c, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  if (!agent.canEdit && !auth.isAdmin()) {
    return apiError(c, {
      status_code: 403,
      api_error: {
        type: "agent_group_permission_error",
        message:
          "Only editors of the agent or workspace admins can modify agent.",
      },
    });
  }

  const { addTagIds = [], removeTagIds = [] } = c.req.valid("json");

  const tagsToAdd = await TagResource.fetchByIds(auth, addTagIds);
  const tagsToRemove = await TagResource.fetchByIds(auth, removeTagIds);

  if (
    tagsToAdd.length !== addTagIds.length ||
    tagsToRemove.length !== removeTagIds.length
  ) {
    return apiError(c, {
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
    return apiError(c, {
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

  return c.json({ tags: tags.map((t) => t.toJSON()) });
});

export default app;
