import { pokeApp } from "@front-api/middlewares/ctx";

import tId from "./[tId]";
import search from "./search";

// Mounted at /api/poke/workspaces/:wId/triggers.
const app = pokeApp();

app.route("/search", search);
app.route("/:tId", tId);

export default app;
