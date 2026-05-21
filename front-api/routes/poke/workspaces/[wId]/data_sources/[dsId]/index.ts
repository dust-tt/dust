import { pokeApp } from "@front-api/middlewares/ctx";

import config from "./config";
import document from "./document";
import documents from "./documents";
import managed from "./managed";
import query from "./query";
import search from "./search";
import tables from "./tables";

const app = pokeApp();

app.route("/config", config);
app.route("/document", document);
app.route("/documents", documents);
app.route("/managed", managed);
app.route("/query", query);
app.route("/search", search);
app.route("/tables", tables);

export default app;
