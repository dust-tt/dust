import { pokeApp } from "@front-api/middleware/env";

import currency from "./currency";

const app = pokeApp();

app.route("/currency", currency);

export default app;
