import { publicApiApp } from "@front-api/middlewares/ctx";

import rel from "./[...rel]";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/files.
const app = publicApiApp();

app.route("/", rel);

export default app;
