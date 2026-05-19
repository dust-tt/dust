import { Hono } from "hono";

import key from "./[key]";

// Mounted under /api/user/metadata.
const app = new Hono();

app.route("/:key", key);

export default app;
