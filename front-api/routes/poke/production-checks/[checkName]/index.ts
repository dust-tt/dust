import { Hono } from "hono";

import history from "./history";

const app = new Hono();

app.route("/history", history);

export default app;
