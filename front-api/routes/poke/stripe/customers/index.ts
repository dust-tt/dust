import { Hono } from "hono";

import currency from "./currency";

const app = new Hono();

app.route("/currency", currency);

export default app;
