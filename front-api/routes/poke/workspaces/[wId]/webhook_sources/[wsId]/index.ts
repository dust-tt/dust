import { pokeWorkspaceApp } from "@front-api/middleware/env";

import details from "./details";

const app = pokeWorkspaceApp();

app.route("/details", details);

export default app;
