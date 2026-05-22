import { pokeApp } from "@front-api/middleware/env";

import history from "./history";

const app = pokeApp();

app.route("/history", history);

export default app;
