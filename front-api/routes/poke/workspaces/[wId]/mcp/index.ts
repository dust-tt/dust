import { Hono } from "hono";

import views from "./views";

const app = new Hono();

app.route("/views", views);

export default app;
