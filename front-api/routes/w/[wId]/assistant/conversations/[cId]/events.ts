import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";

// Mounted at /api/w/:wId/assistant/conversations/:cId/events.
//
// This endpoint is SSE: the actual handler lives in Hono at
// `front-api/routes/sse/w/[wId]/assistant/conversations/[cId]/events.ts`,
// served under the `/api/sse/` prefix that the ingress routes to dedicated
// front-sse pods. Hono only registers a 307 redirect here so the routing
// contract matches the Next middleware redirect at the same path.
const app = workspaceApp();

app.get("/", redirectToSse);

export default app;
