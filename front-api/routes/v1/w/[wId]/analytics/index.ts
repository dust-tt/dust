import { publicApiApp } from "@front-api/middlewares/ctx";

import exportRoute from "./export";

// Mounted at /api/v1/w/:wId/analytics.
const app = publicApiApp();

app.route("/export", exportRoute);

export default app;
