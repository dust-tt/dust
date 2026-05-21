import { Hono } from "hono";

import prestop from "./prestop";

const app = new Hono();
app.route("/prestop", prestop);

export default app;
