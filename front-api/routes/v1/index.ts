import { unauthedApp } from "../../middlewares/ctx";
import publicAuthActionApp from "./auth/[action]";
import publicMeApp from "./me";
import publicFramesTokenApp from "./public/frames/[token]";
import publicWorkspaceApp from "./w/[wId]";

const app = unauthedApp();

app.route("/auth/:action", publicAuthActionApp);
app.route("/me", publicMeApp);
app.route("/public/frames/:token", publicFramesTokenApp);
app.route("/w/:wId", publicWorkspaceApp);

export default app;
