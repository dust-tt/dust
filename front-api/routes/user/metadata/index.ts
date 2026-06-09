import { createHono } from "@front-api/lib/hono";

import key from "./[key]";

// Mounted under /api/user/metadata.
const app = createHono();

app.route("/:key", key);

export default app;
