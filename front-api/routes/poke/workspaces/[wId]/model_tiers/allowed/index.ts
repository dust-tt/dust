import { pokeApp } from "@front-api/middlewares/ctx";

import groups from "./groups";
import users from "./users";
import workspace from "./workspace";

// Mounted at /api/poke/workspaces/:wId/model_tiers/allowed.
const app = pokeApp();

app.route("/users", users);
app.route("/groups", groups);
app.route("/workspace", workspace);

export default app;
