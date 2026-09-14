import { sandboxApp } from "@front-api/middlewares/ctx";

import databases from "./databases";

// Mounted at /api/v1/w/:wId/sandbox/frames/:frameId.
const app = sandboxApp();

app.route("/databases", databases);

export default app;
