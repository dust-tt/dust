import { pokeApp } from "@front-api/middlewares/ctx";

import messageId from "./[mId]";

// Mounted at /api/poke/workspaces/:wId/conversations/:cId/messages.
const app = pokeApp();

app.route("/:mId", messageId);

export default app;
