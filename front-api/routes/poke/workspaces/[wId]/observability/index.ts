import { pokeApp } from "@front-api/middlewares/ctx";

import datasourceRetrieval from "./datasource-retrieval";

const app = pokeApp();

app.route("/datasource-retrieval", datasourceRetrieval);

export default app;
