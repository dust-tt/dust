import { publicApiApp } from "@front-api/middlewares/ctx";

import actions from "./actions";

// Mounted at /api/v1/w/:wId/sandbox.
const app = publicApiApp();

app.route("/actions", actions);

export default app;
