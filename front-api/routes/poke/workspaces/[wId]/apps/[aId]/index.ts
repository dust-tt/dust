import { Hono } from "hono";

import details from "./details";
import exportApp from "./export";
import state from "./state";

const app = new Hono();

app.route("/details", details);
app.route("/export", exportApp);
app.route("/state", state);

export default app;
