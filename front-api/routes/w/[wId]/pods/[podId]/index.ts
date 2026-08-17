import { workspaceApp } from "@front-api/middlewares/ctx";

import apps from "./apps";
import tasks from "./tasks";

const app = workspaceApp();

app.route("/apps", apps);
app.route("/tasks", tasks);

export default app;
