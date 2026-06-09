import { publicApiApp } from "@front-api/middlewares/ctx";

import runs from "./runs";

// Mounted at /api/v1/w/:wId/spaces/:spaceId/apps/:aId.
const app = publicApiApp();

app.route("/runs", runs);

export default app;
