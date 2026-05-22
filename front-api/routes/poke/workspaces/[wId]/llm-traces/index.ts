import { pokeApp } from "@front-api/middlewares/ctx";

import runId from "./[runId]";

const app = pokeApp();

app.route("/:runId", runId);

export default app;
