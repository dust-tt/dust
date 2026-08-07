import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";

const app = workspaceApp();

app.route("/overview", overview);

export default app;
