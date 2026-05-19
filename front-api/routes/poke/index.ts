import { Hono } from "hono";

import { pokeAuth } from "@front-api/middleware/poke_auth";

import plans from "./plans";
import workspaces from "./workspaces";

// Mounted at /api/poke. Every route below inherits pokeAuth, which resolves
// the super-user Authenticator and stashes it on the context.
const app = new Hono();

app.use("*", pokeAuth);

app.route("/plans", plans);
app.route("/workspaces", workspaces);

export default app;
