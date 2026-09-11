import { sandboxFrameApp } from "@front-api/middlewares/ctx";

import query from "./query";

// Mounted at /api/v1/w/:wId/sandbox/frames/:frameId/databases/:database.
const app = sandboxFrameApp();

app.route("/query", query);

export default app;
