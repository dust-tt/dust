import { Hono } from "hono";

import customers from "./customers";

const app = new Hono();

app.route("/customers", customers);

export default app;
