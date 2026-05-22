import { workspaceApp } from "@front-api/middlewares/ctx";

import assistants from "./assistants";
import skills from "./skills";

// Mounted under /api/w/:wId/builder. workspaceAuth is applied by the parent
// workspace sub-app.
const app = workspaceApp();

app.route("/assistants", assistants);
app.route("/skills", skills);

export default app;
