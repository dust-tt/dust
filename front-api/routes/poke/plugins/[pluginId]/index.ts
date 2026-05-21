import { Hono } from "hono";

import manifest from "./manifest";

const app = new Hono();

app.route("/manifest", manifest);

export default app;
