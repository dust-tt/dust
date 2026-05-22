import { pokeApp } from "@front-api/middleware/env";

import customers from "./customers";

const app = pokeApp();

app.route("/customers", customers);

export default app;
