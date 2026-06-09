import { pokeApp } from "@front-api/middlewares/ctx";

import currency from "./currency";

const app = pokeApp();

app.route("/currency", currency);

export default app;
