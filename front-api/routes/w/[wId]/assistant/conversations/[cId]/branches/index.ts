import { workspaceApp } from "@front-api/middlewares/ctx";

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches.
const app = workspaceApp();

// Legacy: conversation branches were removed. Browser extension still call
// this endpoint on every conversation load.
/** @ignoreswagger */
app.get("/", (ctx) => ctx.json({ branch: null }));

export default app;
