import { pokeWorkspaceApp } from "@front-api/middleware/env";

import config from "./config";
import document from "./document";
import tables from "./tables";

const app = pokeWorkspaceApp();

app.route("/config", config);
app.route("/document", document);
app.route("/tables", tables);

export default app;
