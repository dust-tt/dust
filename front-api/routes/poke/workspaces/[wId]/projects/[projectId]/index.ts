import { pokeWorkspaceApp } from "@front-api/middleware/env";

import connectorKnowledge from "./connector-knowledge";
import tasks from "./tasks";
import tasksWorkflow from "./tasks-workflow";

const app = pokeWorkspaceApp();

app.route("/connector-knowledge", connectorKnowledge);
app.route("/tasks-workflow", tasksWorkflow);
app.route("/tasks", tasks);

export default app;
