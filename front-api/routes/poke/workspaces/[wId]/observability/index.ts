import { Hono } from "hono";

import datasourceRetrieval from "./datasource-retrieval";

const app = new Hono();

app.route("/datasource-retrieval", datasourceRetrieval);

export default app;
