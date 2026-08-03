import { workspaceApp } from "@front-api/middlewares/ctx";

import contract from "./contract";
import invoice from "./invoice";
import migration from "./migration";

// Mounted at /api/w/:wId/metronome.
const app = workspaceApp();

app.route("/contract", contract);
app.route("/invoice", invoice);
app.route("/migration", migration);

export default app;
