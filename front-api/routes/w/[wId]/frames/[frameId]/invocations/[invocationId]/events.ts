import { redirectToSse } from "@front-api/lib/api/sse/redirect";
import { workspaceApp } from "@front-api/middlewares/ctx";

const app = workspaceApp();

/** @ignoreswagger */
app.get("/", redirectToSse);

export default app;
