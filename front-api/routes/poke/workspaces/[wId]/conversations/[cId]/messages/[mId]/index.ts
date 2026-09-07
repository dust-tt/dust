import { pokeApp } from "@front-api/middlewares/ctx";

import consumption from "./consumption";

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/messages/:mId.
const app = pokeApp();

app.route("/consumption", consumption);

export default app;
