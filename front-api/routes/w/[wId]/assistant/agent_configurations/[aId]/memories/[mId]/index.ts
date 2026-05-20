import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import type { APIErrorResponse } from "@app/types/error";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import type { Context, TypedResponse } from "hono";
import { Hono } from "hono";
import { z } from "zod";

// `lastUpdated` is a `Date` in `AgentMemoryResource.toJSON()` but JSON-serializes
// to an ISO string on the wire; the type reflects the wire format. Consumers
// (e.g. `AgentMemoryTab`) already pass it through `new Date(...)`, so the
// string form is compatible.
export type PatchAgentMemoryResponseBody = {
  memory: {
    sId: string;
    lastUpdated: string;
    content: string;
  };
};

const PatchAgentMemoryRequestBodySchema = z.object({
  content: z.string(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/memories/:mId.
const app = new Hono();

async function loadAgentAndMemory(
  ctx: Context
): Promise<
  | { ok: true; memory: AgentMemoryResource }
  | { ok: false; response: Response & TypedResponse<APIErrorResponse> }
> {
  const auth = ctx.get("auth");
  const aId = ctx.req.param("aId") ?? "";
  const mId = ctx.req.param("mId") ?? "";

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
    variant: "light",
  });
  if (!agentConfiguration || !agentConfiguration.canRead) {
    return {
      ok: false,
      response: apiError(ctx, {
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
      response: apiError(ctx, {
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
      response: apiError(ctx, {
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
  async (ctx): HandlerResult<PatchAgentMemoryResponseBody> => {
    const r = await loadAgentAndMemory(ctx);
    if (!r.ok) {
      return r.response;
    }
    const auth = ctx.get("auth");
    const { content } = ctx.req.valid("json");

    await r.memory.updateContent(auth, content);

    return ctx.json({ memory: r.memory.toJSON() });
  }
);

app.delete("/", async (ctx) => {
  const r = await loadAgentAndMemory(ctx);
  if (!r.ok) {
    return r.response;
  }
  const auth = ctx.get("auth");

  const result = await r.memory.delete(auth, {});
  if (result.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to delete memory.",
      },
    });
  }

  return ctx.body(null, 204);
});

export default app;
