import { workspaceApp } from "@front-api/middlewares/ctx";

import info from "./info";
import invoices from "./invoices";

// Mounted at /api/w/:wId/billing.
const app = workspaceApp();

app.route("/info", info);
app.route("/invoices", invoices);

export default app;
