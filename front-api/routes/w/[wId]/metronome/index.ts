import { workspaceApp } from "@front-api/middlewares/ctx";

import cancellation from "./cancellation";
import contract from "./contract";
import invoice from "./invoice";

// Mounted at /api/w/:wId/metronome.
const app = workspaceApp();

app.route("/cancellation", cancellation);
app.route("/contract", contract);
app.route("/invoice", invoice);

export default app;
