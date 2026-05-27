import { publicApiApp } from "@front-api/middlewares/ctx";

import upload from "./upload";

// Mounted at /api/v1/w/:wId/search/tools.
const app = publicApiApp();

app.route("/upload", upload);

export default app;
