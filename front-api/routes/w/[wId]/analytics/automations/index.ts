import { workspaceApp } from "@front-api/middlewares/ctx";
import triggers from "./triggers";

const app = workspaceApp();

app.route("/triggers", triggers);

export default app;
