import { workspaceApp } from "@front-api/middlewares/ctx";

import functionName from "./[name]";

const app = workspaceApp();

app.route("/:name", functionName);

export default app;
