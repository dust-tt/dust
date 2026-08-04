import { workspaceApp } from "@front-api/middlewares/ctx";
import overview from "./overview";
import timeseries from "./timeseries";

const app = workspaceApp();

app.route("/overview", overview);
app.route("/timeseries", timeseries);

export default app;
