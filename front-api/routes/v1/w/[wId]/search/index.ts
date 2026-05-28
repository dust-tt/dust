import { publicApiApp } from "@front-api/middlewares/ctx";

import tools from "./tools";

// Mounted at /api/v1/w/:wId/search.
const app = publicApiApp();

app.route("/tools", tools);

export default app;
