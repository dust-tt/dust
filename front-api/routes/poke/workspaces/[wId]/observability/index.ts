import { pokeWorkspaceApp } from "@front-api/middleware/env";

import datasourceRetrieval from "./datasource-retrieval";

const app = pokeWorkspaceApp();

app.route("/datasource-retrieval", datasourceRetrieval);

export default app;
