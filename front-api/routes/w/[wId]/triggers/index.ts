import { workspaceApp } from "@front-api/middlewares/ctx";
import bulkExecutionMode from "./bulk-execution-mode";

const app = workspaceApp();

app.route("/bulk-execution-mode", bulkExecutionMode);

export default app;
