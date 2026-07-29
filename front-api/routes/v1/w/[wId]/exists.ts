import { publicApiApp } from "@front-api/middlewares/ctx";
import type { HandlerResult } from "@front-api/middlewares/utils";

export type GetWorkspaceExistsResponseBody = {
  exists: true;
};

// Mounted at /api/v1/w/:wId/exists. publicApiAuth is applied by the parent
// v1 workspace sub-app: it already returns 404 when the workspace does not
// exist or has been relocated, and 503 while it is in maintenance, so the
// handler does no work beyond authentication.
const app = publicApiApp();

/** @ignoreswagger */
app.get("/", async (ctx): HandlerResult<GetWorkspaceExistsResponseBody> => {
  return ctx.json({ exists: true as const });
});

export default app;
