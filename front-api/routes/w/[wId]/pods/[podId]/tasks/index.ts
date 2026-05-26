import { workspaceApp } from "@front-api/middlewares/ctx";
import seed from "./seed";

const app = workspaceApp();

app.route("/seed", seed);

export default app;
