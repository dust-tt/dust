import { pokeApp } from "@front-api/middlewares/ctx";

import customers from "./customers";

const app = pokeApp();

app.route("/customers", customers);

export default app;
