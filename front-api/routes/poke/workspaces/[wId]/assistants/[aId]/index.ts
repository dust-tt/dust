import { pokeApp } from "@front-api/middlewares/ctx";

import suggestions from "./suggestions";

const app = pokeApp();

app.route("/suggestions", suggestions);

export default app;
