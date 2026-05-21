import { Hono } from "hono";

import suggestions from "./suggestions";

const app = new Hono();

app.route("/suggestions", suggestions);

export default app;
