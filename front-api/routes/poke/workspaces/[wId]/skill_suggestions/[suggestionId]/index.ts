import { pokeApp } from "@front-api/middlewares/ctx";

import details from "./details";

const app = pokeApp();

app.route("/details", details);

export default app;
