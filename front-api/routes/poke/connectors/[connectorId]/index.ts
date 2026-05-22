import { pokeApp } from "@front-api/middleware/env";

import redirect from "./redirect";

// Mounted at /api/poke/connectors/:connectorId.
const app = pokeApp();

app.route("/redirect", redirect);

export default app;
