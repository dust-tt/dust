import { createHono } from "@front-api/lib/hono";

import token from "./[token]";

const app = createHono();
app.route("/:token", token);

export default app;
