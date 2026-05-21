import { Hono } from "hono";

import config from "./config";
import document from "./document";
import tables from "./tables";

const app = new Hono();

app.route("/config", config);
app.route("/document", document);
app.route("/tables", tables);

export default app;
