import { Hono } from "hono";

import token from "./[token]";

const app = new Hono();
app.route("/:token", token);

export default app;
