import { pokeApp } from "@front-api/middlewares/ctx";

import asyncArgs from "./async-args";
import manifest from "./manifest";
import run from "./run";

const app = pokeApp();

app.route("/async-args", asyncArgs);
app.route("/manifest", manifest);
app.route("/run", run);

export default app;
