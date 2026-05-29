import { workspaceApp } from "@front-api/middlewares/ctx";

import defaultUserSpendLimit from "./default_user_spend_limit";

// Mounted at /api/w/:wId/usage_settings.
const app = workspaceApp();

app.route("/default_user_spend_limit", defaultUserSpendLimit);

export default app;
