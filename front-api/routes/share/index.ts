import { Hono } from "hono";

import frame from "./frame";

const app = new Hono();
app.route("/frame", frame);

export default app;
