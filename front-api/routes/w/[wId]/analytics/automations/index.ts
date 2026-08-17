import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";
import triggerBreakdown from "./trigger-breakdown";
import triggers from "./triggers";

const app = workspaceApp();

app.route("/overview", overview);
app.route("/triggers", triggers);
app.route("/trigger-breakdown", triggerBreakdown);

export default app;
