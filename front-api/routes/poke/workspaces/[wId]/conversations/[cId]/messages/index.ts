import { pokeApp } from "@front-api/middlewares/ctx";

import message from "./[mId]";

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/messages.
const app = pokeApp();

app.route("/:mId", message);

export default app;
