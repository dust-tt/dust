import { workspaceApp } from "@front-api/middlewares/ctx";

import provider from "./[provider]";

const app = workspaceApp();

app.route("/:provider", provider);

export default app;
