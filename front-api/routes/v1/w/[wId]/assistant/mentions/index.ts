import { publicApiApp } from "@front-api/middlewares/ctx";

import parse from "./parse";

// Mounted at /api/v1/w/:wId/assistant/mentions.
const app = publicApiApp();

app.route("/parse", parse);

export default app;
