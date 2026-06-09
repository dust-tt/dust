import { workspaceApp } from "@front-api/middlewares/ctx";

import contract from "./contract";
import invoice from "./invoice";

// Mounted at /api/w/:wId/metronome.
const app = workspaceApp();

app.route("/contract", contract);
app.route("/invoice", invoice);

export default app;
