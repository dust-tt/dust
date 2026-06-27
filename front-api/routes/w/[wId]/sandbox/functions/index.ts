import { workspaceApp } from "@front-api/middlewares/ctx";

import functionId from "./[functionId]";

const app = workspaceApp();

app.route("/:functionId", functionId);

export default app;
