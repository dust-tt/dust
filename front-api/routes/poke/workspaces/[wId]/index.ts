import { Hono } from "hono";

import { pokeWorkspaceAuth } from "@front-api/middleware/poke_workspace_auth";

import apps from "./apps";
import projects from "./projects";
import skillSuggestions from "./skill_suggestions";
import skills from "./skills";
import triggers from "./triggers";

// Mounted at /api/poke/workspaces/:wId. Every route below inherits
// pokeWorkspaceAuth, which resolves the super-user Authenticator for the
// target workspace and stashes it on the context.
const app = new Hono();

app.use("*", pokeWorkspaceAuth);

app.route("/apps", apps);
app.route("/projects", projects);
app.route("/skill_suggestions", skillSuggestions);
app.route("/skills", skills);
app.route("/triggers", triggers);

export default app;
