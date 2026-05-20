import { pokeAuth } from "@front-api/middleware/poke_auth";
import { Hono } from "hono";

import admin from "./admin";
import authContext from "./auth-context";
import cache from "./cache";
import connectors from "./connectors";
import coupons from "./coupons";
import globalAgentFeedbacks from "./global-agent-feedbacks";
import kill from "./kill";
import plans from "./plans";
import region from "./region";
import templates from "./templates";
import workspaces from "./workspaces";

// Mounted at /api/poke. Every route below inherits pokeAuth, which resolves
// the super-user Authenticator and stashes it on the context.
const app = new Hono();

app.use("*", pokeAuth);

app.route("/admin", admin);
app.route("/auth-context", authContext);
app.route("/cache", cache);
app.route("/connectors", connectors);
app.route("/coupons", coupons);
app.route("/global-agent-feedbacks", globalAgentFeedbacks);
app.route("/kill", kill);
app.route("/plans", plans);
app.route("/region", region);
app.route("/templates", templates);
app.route("/workspaces", workspaces);

export default app;
