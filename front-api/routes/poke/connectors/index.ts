import { pokeApp } from "@front-api/middleware/env";

import connectorId from "./[connectorId]";

// Mounted at /api/poke/connectors.
const app = pokeApp();

app.route("/:connectorId", connectorId);

export default app;
