import { pokeApp } from "@front-api/middlewares/ctx";

import config from "./config";
import document from "./document";
import tables from "./tables";

const app = pokeApp();

app.route("/config", config);
app.route("/document", document);
app.route("/tables", tables);

export default app;
