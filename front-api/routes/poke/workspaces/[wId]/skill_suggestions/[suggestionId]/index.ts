import { Hono } from "hono";

import details from "./details";

const app = new Hono();

app.route("/details", details);

export default app;
