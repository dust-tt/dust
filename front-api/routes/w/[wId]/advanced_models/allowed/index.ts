import { workspaceApp } from "@front-api/middlewares/ctx";
import groups from "./groups";
import users from "./users";
import workspace from "./workspace";

// Mounted at /api/w/:wId/advanced_models/allowed.
const app = workspaceApp();

app.route("/users", users);
app.route("/groups", groups);
app.route("/workspace", workspace);

export default app;
