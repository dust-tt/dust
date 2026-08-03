import { workspaceApp } from "@front-api/middlewares/ctx";

import businessActivation from "./business-activation";
import preparePayment from "./prepare-payment";

// Mounted at /api/w/:wId/subscriptions/checkout.
const app = workspaceApp();

app.route("/business-activation", businessActivation);
app.route("/prepare-payment", preparePayment);

export default app;
