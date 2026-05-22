import { pokeApp } from "@front-api/middlewares/ctx";

import views from "./views";

const app = pokeApp();

app.route("/views", views);

export default app;
