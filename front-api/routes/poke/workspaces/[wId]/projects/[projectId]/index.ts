import { pokeApp } from "@front-api/middlewares/ctx";

import connectorKnowledge from "./connector-knowledge";
import tasks from "./tasks";
import tasksWorkflow from "./tasks-workflow";

const app = pokeApp();

app.route("/connector-knowledge", connectorKnowledge);
app.route("/tasks-workflow", tasksWorkflow);
app.route("/tasks", tasks);

export default app;
