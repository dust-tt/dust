import { pokeWorkspaceApp } from "@front-api/middleware/env";

import suggestions from "./suggestions";

const app = pokeWorkspaceApp();

app.route("/suggestions", suggestions);

export default app;
