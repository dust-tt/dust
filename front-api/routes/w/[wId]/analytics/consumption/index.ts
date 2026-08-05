import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";
import timeseries from "./timeseries";
import top from "./top";

const app = workspaceApp();

app.route("/overview", overview);
app.route("/timeseries", timeseries);
app.route("/top", top);

export default app;
