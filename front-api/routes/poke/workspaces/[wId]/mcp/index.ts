import { pokeWorkspaceApp } from "@front-api/middleware/env";

import views from "./views";

const app = pokeWorkspaceApp();

app.route("/views", views);

export default app;
