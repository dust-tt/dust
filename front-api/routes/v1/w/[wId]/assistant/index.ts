import { publicApiApp } from "@front-api/middlewares/ctx";

import conversations from "./conversations";

// Mounted at /api/v1/w/:wId/assistant.
const app = publicApiApp();

app.route("/conversations", conversations);

export default app;
