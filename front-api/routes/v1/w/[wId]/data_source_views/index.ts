import { publicApiApp } from "@front-api/middlewares/ctx";

import search from "./search";

// Mounted at /api/v1/w/:wId/data_source_views.
const app = publicApiApp();

app.route("/search", search);

export default app;
