import { Hono } from "hono";

import webhookSecret from "./[webhookSecret]";

const app = new Hono();
app.route("/:webhookSecret", webhookSecret);

export default app;
