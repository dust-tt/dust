import { pokeWorkspaceApp } from "@front-api/middleware/env";

import suggestionId from "./[suggestionId]";

const app = pokeWorkspaceApp();

app.route("/:suggestionId", suggestionId);

export default app;
