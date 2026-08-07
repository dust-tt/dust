import { pokeApp } from "@front-api/middlewares/ctx";

import actionId from "./[aId]";

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/messages/:mId/actions.
const app = pokeApp();

app.route("/:aId", actionId);

export default app;
