import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { publicApiApp } from "@front-api/middlewares/ctx";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId/events.
//
// This endpoint is SSE: the actual handler lives in Hono at
// `front-api/routes/sse/v1/w/[wId]/assistant/conversations/[cId]/messages/[mId]/events.ts`,
// served under the `/api/sse/` prefix that the ingress routes to dedicated
// front-sse pods. Hono only registers a 307 redirect here so the routing
// contract matches the Next middleware redirect at the same path.
const app = publicApiApp();

app.get("/", redirectToSse);

export default app;
