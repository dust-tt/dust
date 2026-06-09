import { pokeApp } from "@front-api/middlewares/ctx";

import sId from "./[sId]";

const app = pokeApp();

app.route("/:sId", sId);

export default app;
