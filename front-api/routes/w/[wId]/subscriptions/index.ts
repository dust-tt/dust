import { Hono } from "hono";

import checkoutStatus from "./checkout-status";
import pricing from "./pricing";
import status from "./status";
import trialInfo from "./trial-info";

// Mounted under /api/w/:wId/subscriptions.
const app = new Hono();

app.route("/checkout-status", checkoutStatus);
app.route("/pricing", pricing);
app.route("/status", status);
app.route("/trial-info", trialInfo);

export default app;
