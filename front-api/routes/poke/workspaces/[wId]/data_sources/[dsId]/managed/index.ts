import { pokeApp } from "@front-api/middlewares/ctx";

import permissions from "./permissions";

const app = pokeApp();

app.route("/permissions", permissions);

export default app;
