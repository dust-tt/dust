import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";
import triggers from "./triggers";

const app = workspaceApp();

app.route("/overview", overview);
app.route("/triggers", triggers);

export default app;
