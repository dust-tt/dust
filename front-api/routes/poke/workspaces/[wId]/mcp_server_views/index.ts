import { Hono } from "hono";

import svId from "./[svId]";

const app = new Hono();

app.route("/:svId", svId);

export default app;
