import { fetchLLMTrace, isLLMTraceId } from "@app/lib/api/llm/traces/buffer";
import { fetchLangfuseTraceByDustTraceId } from "@app/lib/api/llm/traces/langfuse";
import type { GetPokeLLMTraceResponseBody } from "@app/types/api/poke/llm_traces";
import { pokeApp } from "@front-api/middlewares/ctx";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  runId: z.string(),
});

// Mounted at /api/poke/workspaces/:wId/llm-traces/:runId.
const app = pokeApp();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetPokeLLMTraceResponseBody> => {
    const auth = ctx.get("auth");
    const { runId } = ctx.req.valid("param");

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

    const [trace, langfuseTraceRes] = await Promise.all([
      fetchLLMTrace(auth, { runId }),
      fetchLangfuseTraceByDustTraceId(auth, { dustTraceId: runId }),
    ]);

    return ctx.json({
      langfuseError: langfuseTraceRes.isErr()
        ? langfuseTraceRes.error.message
        : null,
      langfuseTrace: langfuseTraceRes.isOk() ? langfuseTraceRes.value : null,
      trace,
    });
  }
);

export default app;
