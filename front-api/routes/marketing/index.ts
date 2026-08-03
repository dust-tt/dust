import { createHono } from "@front-api/lib/hono";

import academy from "./academy";
import integrations from "./integrations";
import modelCredits from "./model_credits";

// Mounted under /api/marketing.
const app = createHono();

app.route("/academy", academy);
app.route("/integrations", integrations);
app.route("/model-credits", modelCredits);

export default app;
