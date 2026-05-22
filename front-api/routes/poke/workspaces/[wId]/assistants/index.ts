import { pokeApp } from "@front-api/middlewares/ctx";

import aId from "./[aId]";

const app = pokeApp();

app.route("/:aId", aId);

export default app;
