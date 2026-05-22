import { pokeApp } from "@front-api/middlewares/ctx";

import details from "./details";
import suggestions from "./suggestions";
import versions from "./versions";

const app = pokeApp();

app.route("/details", details);
app.route("/suggestions", suggestions);
app.route("/versions", versions);

export default app;
