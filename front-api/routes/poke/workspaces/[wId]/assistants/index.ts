import { pokeWorkspaceApp } from "@front-api/middleware/env";

import aId from "./[aId]";

const app = pokeWorkspaceApp();

app.route("/:aId", aId);

export default app;
