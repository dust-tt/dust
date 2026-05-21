import { Hono } from "hono";

import provider from "./[provider]";

const app = new Hono();
app.route("/:provider", provider);

export default app;
