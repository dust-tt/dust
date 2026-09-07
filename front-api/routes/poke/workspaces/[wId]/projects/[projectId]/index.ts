import { pokeProjectApp } from "@front-api/middlewares/ctx";
import { withProject } from "@front-api/middlewares/with_projects";

import connectorKnowledge from "./connector-knowledge";
import conversations from "./conversations";
import podDatabases from "./pod-databases";
import tasks from "./tasks";

const app = pokeProjectApp();

app.use("*", withProject());

app.route("/connector-knowledge", connectorKnowledge);
app.route("/conversations", conversations);
app.route("/tasks", tasks);
app.route("/pod-databases", podDatabases);

export default app;
