import { Hono } from "hono";

import aId from "./[aId]";

const app = new Hono();

app.route("/:aId", aId);

export default app;
