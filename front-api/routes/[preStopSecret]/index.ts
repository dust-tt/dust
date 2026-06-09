import { createHono } from "@front-api/lib/hono";

import prestop from "./prestop";

const app = createHono();
app.route("/prestop", prestop);

export default app;
