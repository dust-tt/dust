import { pokeApp } from "@front-api/middleware/env";

import packages from "./packages";

const app = pokeApp();

app.route("/packages", packages);

export default app;
