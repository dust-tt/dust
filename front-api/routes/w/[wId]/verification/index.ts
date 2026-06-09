import { workspaceApp } from "@front-api/middlewares/ctx";

import start from "./start";
import validate from "./validate";

// Mounted at /api/w/:wId/verification.
const app = workspaceApp();

app.route("/start", start);
app.route("/validate", validate);

export default app;
