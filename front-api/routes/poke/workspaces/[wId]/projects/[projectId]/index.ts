import { pokeProjectApp } from "@front-api/middlewares/ctx";
import { withProject } from "@front-api/middlewares/with_projects";

import connectorKnowledge from "./connector-knowledge";
import podFunctions from "./pod-functions";
import tasks from "./tasks";
import tasksWorkflow from "./tasks-workflow";

const app = pokeProjectApp();

app.use("*", withProject());

app.route("/connector-knowledge", connectorKnowledge);
app.route("/tasks-workflow", tasksWorkflow);
app.route("/tasks", tasks);
app.route("/pod-functions", podFunctions);

export default app;
