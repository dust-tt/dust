import { Hono } from "hono";

import finalize from "./finalize";

const app = new Hono();
app.route("/finalize", finalize);

export default app;
