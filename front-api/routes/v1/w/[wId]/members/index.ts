import { publicApiApp } from "@front-api/middlewares/ctx";

import emails from "./emails";
import validate from "./validate";

// Mounted at /api/v1/w/:wId/members.
const app = publicApiApp();

app.route("/emails", emails);
app.route("/validate", validate);

export default app;
