import { pokeApp } from "@front-api/middlewares/ctx";

import actions from "./actions";

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/messages/:mId.
const app = pokeApp();

app.route("/actions", actions);

export default app;
