import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { TagAgentModel } from "@app/lib/models/agent/tag_agent";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { TagType } from "@app/types/tag";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_is_admin";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tagById from "./[tId]";
import suggestFromAgents from "./suggest_from_agents";
import usage from "./usage";

export type GetTagsResponseBody = {
  tags: TagType[];
};

export type CreateTagResponseBody = {
  tag: TagType;
};

const PostBodySchema = z.object({
  name: z.string(),
  agentIds: z.array(z.string()).optional(),
});

// Mounted at /api/w/:wId/tags.
const app = workspaceApp();

app.get("/", async (ctx): HandlerResult<GetTagsResponseBody> => {
  const auth = ctx.get("auth");

  const tags = await TagResource.findAll(auth);

  return ctx.json({
    tags: tags.map((tag) => tag.toJSON()),
  });
});

app.post(
  "/",
  ensureIsAdmin(),
  validate("json", PostBodySchema),
  async (ctx): HandlerResult<CreateTagResponseBody> => {
    const auth = ctx.get("auth");

    const { name, agentIds } = ctx.req.valid("json");

    const existingTag = await TagResource.findByName(auth, name);

    if (existingTag) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "A tag with this name already exists",
        },
      });
    }

    const newTag = await TagResource.makeNew(auth, {
      name,
      kind: "standard",
    });

    if (agentIds) {
      const agentsToTag = await AgentConfigurationModel.findAll({
        where: {
          sId: agentIds,
          workspaceId: auth.getNonNullableWorkspace().id,
          status: "active",
        },
      });

      for (const agent of agentsToTag) {
        await TagAgentModel.create({
          workspaceId: auth.getNonNullableWorkspace().id,
          tagId: newTag.id,
          agentConfigurationId: agent.id,
        });
      }
    }

    return ctx.json({ tag: newTag.toJSON() }, 201);
  }
);

// Literal subpaths must be registered before the `/:tId` param sub-app,
// otherwise the param route swallows "suggest_from_agents" and "usage" as ids.
app.route("/suggest_from_agents", suggestFromAgents);
app.route("/usage", usage);
app.route("/:tId", tagById);

export default app;
