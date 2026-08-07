import {
  generateSandboxPollerToken,
  isSandboxPollerTokenPayload,
} from "@app/lib/api/sandbox/access_tokens";
import { openPollerChannel } from "@app/lib/api/sandbox_functions/poller_channel";
import {
  SseQuerySchema,
  streamEvents,
} from "@front-api/lib/api/sse/stream_events";
import { sandboxApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/sse/v1/w/:wId/sandbox/poller/work. sandboxAuth is applied by the parent poller
// sub-app, so ctx.get("sandboxClaims") is always a poller token here and ctx.get("sandbox") is the
// sandbox it was minted for.
const app = sandboxApp();

/**
 * @ignoreswagger
 * internal endpoint
 */
app.get("/", validate("query", SseQuerySchema), async (ctx) => {
  const auth = ctx.get("auth");
  const sandboxClaims = ctx.get("sandboxClaims");
  const sandbox = ctx.get("sandbox");
  const { lastEventId } = ctx.req.valid("query");

  if (!isSandboxPollerTokenPayload(sandboxClaims) || !sandbox) {
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "This endpoint requires a Pod function poller token.",
      },
    });
  }


  // Minted before the stream opens so a failure here is a plain error response rather than a
  // stream the poller has already committed to. Connecting is what revokes the token used to
  // connect, so a poller must persist the rotated token it receives first on the stream.
  const rotatedToken = await generateSandboxPollerToken(auth, {
    sandbox,
    supersedes: sandboxClaims,
  });

  return streamEvents({
    ctx,
    iterator: (signal) =>
      openPollerChannel({
        sandboxId: sandbox.sId,
        rotatedToken,
        lastEventId,
        signal,
      }),
    // The hybrid manager signals a truncated history replay by closing the stream, and every
    // streaming route pairs that with the sentinel so the client reconnects to drain the rest.
    writeDoneSentinel: true,
  });
});

export default app;
