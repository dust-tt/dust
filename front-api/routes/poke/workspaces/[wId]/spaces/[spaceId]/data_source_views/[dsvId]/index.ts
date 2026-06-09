import { pokeApp } from "@front-api/middlewares/ctx";

import contentNodes from "./content-nodes";

const app = pokeApp();

app.route("/content-nodes", contentNodes);

export default app;
