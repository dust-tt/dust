import { pokeWorkspaceApp } from "@front-api/middleware/env";

import svId from "./[svId]";

const app = pokeWorkspaceApp();

app.route("/:svId", svId);

export default app;
