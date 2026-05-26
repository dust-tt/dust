import { workspaceApp } from "@front-api/middlewares/ctx";
import tasks from "./tasks";

const app = workspaceApp();

app.route("/tasks", tasks);

export default app;
