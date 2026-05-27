import { publicApiApp } from "@front-api/middlewares/ctx";

import parse from "./parse";
import suggestions from "./suggestions";

// Mounted at /api/v1/w/:wId/assistant/mentions.
const app = publicApiApp();

app.route("/parse", parse);
app.route("/suggestions", suggestions);

export default app;
