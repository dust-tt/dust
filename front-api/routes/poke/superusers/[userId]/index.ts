import { pokeApp } from "@front-api/middlewares/ctx";

import superuser from "./superuser";

const app = pokeApp();

app.route("/superuser", superuser);

export default app;
