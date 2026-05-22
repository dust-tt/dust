import { pokeWorkspaceApp } from "@front-api/middleware/env";

import runId from "./[runId]";

const app = pokeWorkspaceApp();

app.route("/:runId", runId);

export default app;
