import { AgentResource } from "@app/lib/resources/agent_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import type {
  CreateTagResponseBody,
  GetTagsResponseBody,
} from "@app/types/api/tags";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureIsAdmin } from "@front-api/middlewares/ensure_role";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import tagById from "./[tId]";
import suggestFromAgents from "./suggest_from_agents";
import usage from "./usage";

const PostBodySchema = z.object({
  name: z.string(),
  agentIds: z.array(z.string()).optional(),
});

// Mounted at /api/w/:wId/tags.
const app = workspaceApp();

/** @ignoreswagger */
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

    // Recreating a soft-deleted tag restores it (undelete); see `TagResource.makeNew`.
    const newTag = await TagResource.makeNew(auth, {
      name,
      kind: "standard",
    });

    if (agentIds && agentIds.length > 0) {
      await AgentResource.bulkUpdate(auth, agentIds, { addTags: [newTag] });
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
