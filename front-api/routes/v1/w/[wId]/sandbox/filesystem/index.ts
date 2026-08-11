import { sandboxApp } from "@front-api/middlewares/ctx";
import { sandboxAuth } from "@front-api/middlewares/sandbox_auth";

import mutations from "./mutations";

// Mounted at /api/v1/w/:wId/sandbox/filesystem.
const app = sandboxApp();

app.use("*", sandboxAuth({ allowedTokenKinds: ["filesystem"] }));
app.route("/mutations", mutations);

export default app;
