import { pokeWorkspaceApp } from "@front-api/middleware/env";

import details from "./details";
import suggestions from "./suggestions";
import versions from "./versions";

const app = pokeWorkspaceApp();

app.route("/details", details);
app.route("/suggestions", suggestions);
app.route("/versions", versions);

export default app;
