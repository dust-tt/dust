import { workspaceApp } from "@front-api/middlewares/ctx";

import redirectUri from "./redirect_uri";
import setup from "./setup";

const app = workspaceApp();

app.route("/redirect_uri", redirectUri);
app.route("/setup", setup);

export default app;
