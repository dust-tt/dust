import { publicApiApp } from "@front-api/middlewares/ctx";

import suggestions from "./suggestions";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/mentions.
const app = publicApiApp();

app.route("/suggestions", suggestions);

export default app;
