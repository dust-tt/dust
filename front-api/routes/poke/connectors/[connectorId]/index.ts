import { pokeApp } from "@front-api/middlewares/ctx";

import redirect from "./redirect";

// Mounted at /api/poke/connectors/:connectorId.
const app = pokeApp();

app.route("/redirect", redirect);

export default app;
