import { Hono } from "hono";

import authContext from "./auth-context";

// Mounted at /api/poke/workspaces/:wId. pokeAuth is applied by the parent
// poke sub-app; workspace-scoped poke routes rebuild auth from
// `c.get("pokeSession")` with the wId param.
const app = new Hono();

app.route("/auth-context", authContext);

export default app;
