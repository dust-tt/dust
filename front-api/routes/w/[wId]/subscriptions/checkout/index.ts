import { workspaceApp } from "@front-api/middlewares/ctx";

import checkoutPaymentStatus from "./checkout-payment-status";
import payment from "./payment";
import preparePayment from "./prepare-payment";

// Mounted at /api/w/:wId/subscriptions/checkout.
const app = workspaceApp();

app.route("/checkout-payment-status", checkoutPaymentStatus);
app.route("/payment", payment);
app.route("/prepare-payment", preparePayment);

export default app;
