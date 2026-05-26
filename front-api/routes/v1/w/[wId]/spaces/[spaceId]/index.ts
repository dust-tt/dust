import { publicApiApp } from "@front-api/middlewares/ctx";

import dataSources from "./data_sources";

// Mounted at /api/v1/w/:wId/spaces/:spaceId. publicApiAuth is applied by the
// parent v1 workspace sub-app, so ctx.get("auth") is always available here.
const app = publicApiApp();

app.route("/data_sources", dataSources);

export default app;
