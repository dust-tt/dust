import { publicApiApp } from "@front-api/middlewares/ctx";

import blocked from "./blocked";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/actions.
const app = publicApiApp();

app.route("/blocked", blocked);

export default app;
