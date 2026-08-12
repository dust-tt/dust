/** @ignoreswagger */

import { hasFeatureFlag } from "@app/lib/auth";
import { resolveFrameViewerAccess } from "@front-api/lib/api/frames/access";
import { streamSandboxFunctionInvocationEventsForRoute } from "@front-api/lib/api/sse/sandbox_function_invocation_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { unauthedApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  token: z.string().min(1),
  functionId: z.string().min(1),
  invocationId: z.string().min(1),
});

// Mounted at /api/sse/v1/public/frames/:token/sandbox-functions/:functionId/invocations/:invocationId/events.
// Public SSE twin of the member events stream, for external email-only frame viewers.
const app = unauthedApp();

app.use("*", streamingTag);

app.get(
  "/",
  validate("param", ParamsSchema),
  validate("query", SseQuerySchema),
  async (ctx) => {
    const { token, functionId, invocationId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");

    const access = await resolveFrameViewerAccess(ctx, token);
    if (!access) {
      return apiError(ctx, {
        status_code: 404,
        api_error: { type: "file_not_found", message: "Share not found." },
      });
    }

    if (!(await hasFeatureFlag(access.auth, "sandbox_functions"))) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message: "Sandbox Functions are not enabled for this workspace.",
        },
      });
    }

    // The pod-confined auth makes fetchById reject any invocation outside this frame's pod.
    return streamSandboxFunctionInvocationEventsForRoute(ctx, access.auth, {
      functionId,
      invocationId,
      lastEventId,
      access: "email_viewer",
    });
  }
);

export default app;
