import { pokeApp } from "@front-api/middlewares/ctx";

import connectorId from "./[connectorId]";
import cliCatalog from "./cli-catalog";

// Mounted at /api/poke/connectors.
const app = pokeApp();

app.route("/cli-catalog", cliCatalog);
app.route("/:connectorId", connectorId);

export default app;
