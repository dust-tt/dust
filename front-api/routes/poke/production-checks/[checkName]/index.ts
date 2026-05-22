import { pokeApp } from "@front-api/middlewares/ctx";

import history from "./history";

const app = pokeApp();

app.route("/history", history);

export default app;
