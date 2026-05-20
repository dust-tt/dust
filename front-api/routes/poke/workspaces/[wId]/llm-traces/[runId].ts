import { fetchLLMTrace, isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
import { Hono } from "hono";

interface GetLLMTraceResponseBody {
  trace: unknown | null;
}

// Mounted at /api/poke/workspaces/:wId/llm-traces/:runId.
const app = new Hono();

app.get("/", async (ctx): HandlerResult<GetLLMTraceResponseBody> => {
  const auth = ctx.get("auth");
  const runId = ctx.req.param("runId");
  if (!runId) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The runId parameter is required.",
      },
    });
  }

  // Validate that this is actually an LLM runId.
  if (!isLLMTraceId(runId)) {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "RunId does not have the expected LLM prefix.",
      },
    });
  }

  const trace = await fetchLLMTrace(auth, { runId });

  return ctx.json({ trace });
});

export default app;
