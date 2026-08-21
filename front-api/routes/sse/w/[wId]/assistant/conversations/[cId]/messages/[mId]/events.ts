import {
  isLegacyChromeExtensionRequest,
  makeLegacyChromeExtensionMessageEventCompatible,
} from "@front-api/lib/api/assistant/legacy_chrome_extension_compatibility";
import type { MessageEventsOptions } from "@front-api/lib/api/sse/message_events";
import {
  MessageParamSchema,
  streamMessageEventsForRoute,
} from "@front-api/lib/api/sse/message_events";
import { SseQuerySchema } from "@front-api/lib/api/sse/stream_events";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { streamingTag } from "@front-api/middlewares/streaming";
import { validate } from "@front-api/middlewares/validator";

// Mounted at /api/sse/w/:wId/assistant/conversations/:cId/messages/:mId/events.
// Handler logic lives in `@front-api/lib/api/sse/message_events`.

const app = workspaceApp();

app.use("*", streamingTag);
/** @ignoreswagger */
app.get(
  "/",
  validate("param", MessageParamSchema),
  validate("query", SseQuerySchema),
  (ctx) => {
    const { cId, mId } = ctx.req.valid("param");
    const { lastEventId } = ctx.req.valid("query");
    const useLegacyChromeCompatibility = isLegacyChromeExtensionRequest({
      origin: ctx.req.header("origin"),
      extensionVersion: ctx.req.header("x-dust-extension-version"),
    });
    const options: MessageEventsOptions = {
      transformEvent: (_auth, event) =>
        useLegacyChromeCompatibility
          ? makeLegacyChromeExtensionMessageEventCompatible(event)
          : event,
    };

    return streamMessageEventsForRoute(
      ctx,
      ctx.var.auth,
      { conversationId: cId, messageId: mId, lastEventId },
      options
    );
  }
);

export default app;
