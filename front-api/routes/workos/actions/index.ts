import { Hono } from "hono";

import actionSecret from "./[actionSecret]";

const app = new Hono();
app.route("/:actionSecret", actionSecret);

export default app;
