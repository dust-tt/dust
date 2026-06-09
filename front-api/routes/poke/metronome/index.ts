import { pokeApp } from "@front-api/middlewares/ctx";

import packages from "./packages";

const app = pokeApp();

app.route("/packages", packages);

export default app;
