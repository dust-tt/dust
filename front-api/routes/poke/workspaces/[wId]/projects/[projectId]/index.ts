import { pokeApp } from "@front-api/middlewares/ctx";

import connectorKnowledge from "./connector-knowledge";
import podFunctions from "./pod-functions";
import tasks from "./tasks";
import tasksWorkflow from "./tasks-workflow";

const app = pokeApp();

app.route("/connector-knowledge", connectorKnowledge);
app.route("/tasks-workflow", tasksWorkflow);
app.route("/tasks", tasks);
app.route("/pod-functions", podFunctions);

export default app;
