import { fetchLLMTrace, isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

interface GetLLMTraceResponseBody {
  trace: unknown | null;
}

const ParamsSchema = z.object({
  runId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/llm-traces/:runId.
const app = pokeApp();

app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetLLMTraceResponseBody> => {
    const auth = ctx.get("auth");
    const { runId } = ctx.req.valid("param");
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
  }
);

export default app;
