import { publicApiApp } from "@front-api/middlewares/ctx";

import consumption from "./consumption";
import exportRoute from "./export";

// Mounted at /api/v1/w/:wId/analytics.
const app = publicApiApp();

app.route("/consumption", consumption);
app.route("/export", exportRoute);

export default app;
