import { createHono } from "@front-api/lib/hono";

import webhookSecret from "./[webhookSecret]";

const app = createHono();
app.route("/:webhookSecret", webhookSecret);

export default app;
