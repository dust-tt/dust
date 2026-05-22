import { workspaceApp } from "@front-api/middlewares/ctx";

import invoice from "./invoice";

// Mounted at /api/w/:wId/metronome.
const app = workspaceApp();

app.route("/invoice", invoice);

export default app;
