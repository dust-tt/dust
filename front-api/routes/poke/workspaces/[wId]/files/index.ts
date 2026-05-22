import { pokeWorkspaceApp } from "@front-api/middleware/env";

import sId from "./[sId]";

const app = pokeWorkspaceApp();

app.route("/:sId", sId);

export default app;
