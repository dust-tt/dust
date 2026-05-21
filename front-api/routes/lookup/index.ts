import { Hono } from "hono";

import resource from "./[resource]";

const app = new Hono();
app.route("/:resource", resource);

export default app;
