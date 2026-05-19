import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";

import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";

const PatchAgentMemoryRequestBodySchema = z.object({
  content: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/memories/:mId.
const app = new Hono();

async function loadAgentAndMemory(
  c: Context
): Promise<
  { ok: true; memory: AgentMemoryResource } | { ok: false; response: Response }
> {
  const auth = c.get("auth");
  const aId = c.req.param("aId") ?? "";
  const mId = c.req.param("mId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration || !agentConfiguration.canRead) {
    return {
      ok: false,
      response: apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message: "The agent configuration was not found.",
        },
      }),
    };
  }

  const user = auth.user();
  if (!user) {
    return {
      ok: false,
      response: apiError(c, {
        status_code: 401,
        api_error: {
          type: "user_authentication_required",
          message:
            "You must be authenticated as a user to access this resource.",
        },
      }),
    };
  }

  const memory = await AgentMemoryResource.fetchByIdForUser(auth, {
    memoryId: mId,
    user: user.toJSON(),
  });
  if (!memory) {
    return {
      ok: false,
      response: apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_memory_not_found",
          message: "The agent memory was not found.",
        },
      }),
    };
  }

  return { ok: true, memory };
}

app.patch(
  "/",
  validate("json", PatchAgentMemoryRequestBodySchema),
  async (c) => {
    const r = await loadAgentAndMemory(c);
    if (!r.ok) {
      return r.response;
    }
    const auth = c.get("auth");
    const { content } = c.req.valid("json");

    await r.memory.updateContent(auth, content);

    return c.json({ memory: r.memory.toJSON() });
  }
);

app.delete("/", async (c) => {
  const r = await loadAgentAndMemory(c);
  if (!r.ok) {
    return r.response;
  }
  const auth = c.get("auth");

  const result = await r.memory.delete(auth, {});
  if (result.isErr()) {
    return apiError(c, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete memory.",
      },
    });
  }

  return c.body(null, 204);
});

export default app;
