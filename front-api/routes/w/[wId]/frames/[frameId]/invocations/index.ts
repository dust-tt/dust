import { workspaceApp } from "@front-api/middlewares/ctx";

import invocationId from "./[invocationId]";

const app = workspaceApp();

app.route("/:invocationId", invocationId);

export default app;
