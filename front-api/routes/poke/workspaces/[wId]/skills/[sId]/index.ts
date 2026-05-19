import { Hono } from "hono";

import details from "./details";
import suggestions from "./suggestions";
import versions from "./versions";

const app = new Hono();

app.route("/details", details);
app.route("/suggestions", suggestions);
app.route("/versions", versions);

export default app;
