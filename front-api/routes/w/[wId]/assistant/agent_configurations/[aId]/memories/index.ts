import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { workspaceApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import mId from "./[mId]";

const ParamsSchema = z.object({
  aId: z.string(),
});

// JSON-serializes Date fields to ISO strings on the wire; type reflects wire
// format. The underlying `AgentMemoryResource.toJSON` returns `lastUpdated:
// Date` but `JSON.stringify` emits a string.
export type GetAgentMemoriesResponseBody = {
  memories: {
    sId: string;
    lastUpdated: string;
    content: string;
  }[];
};

// Mounted under /api/w/:wId/assistant/agent_configurations/:aId/memories.
const app = workspaceApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetAgentMemoriesResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent || !auth.can("read", agent)) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      });
    }

    const user = auth.user();
    if (!user) {
      return ctx.json({ memories: [] });
    }

    const memories =
      await AgentMemoryResource.findByAgentConfigurationIdAndUser(auth, {
        agentConfigurationId: agent.sId,
      });

    return ctx.json({ memories: memories.map((memory) => memory.toJSON()) });
  }
);

app.route("/:mId", mId);

export default app;
