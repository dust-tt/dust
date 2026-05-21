import { Hono } from "hono";

import sId from "./[sId]";

const app = new Hono();

app.route("/:sId", sId);

export default app;
