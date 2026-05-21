import { Hono } from "hono";

import packages from "./packages";

const app = new Hono();

app.route("/packages", packages);

export default app;
