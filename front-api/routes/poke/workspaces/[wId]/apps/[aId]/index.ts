import { pokeWorkspaceApp } from "@front-api/middleware/env";

import details from "./details";
import exportApp from "./export";
import state from "./state";

const app = pokeWorkspaceApp();

app.route("/details", details);
app.route("/export", exportApp);
app.route("/state", state);

export default app;
