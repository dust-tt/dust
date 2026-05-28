import { createHono } from "@front-api/lib/hono";

import resource from "./[resource]";

const app = createHono();
app.route("/:resource", resource);

export default app;
