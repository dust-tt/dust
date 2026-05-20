import { Hono } from "hono";

import connectorKnowledge from "./connector-knowledge";
import tasks from "./tasks";
import tasksWorkflow from "./tasks-workflow";

const app = new Hono();

app.route("/connector-knowledge", connectorKnowledge);
app.route("/tasks-workflow", tasksWorkflow);
app.route("/tasks", tasks);

export default app;
