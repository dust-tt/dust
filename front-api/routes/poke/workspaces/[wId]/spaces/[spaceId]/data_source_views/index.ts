import { pokeApp } from "@front-api/middlewares/ctx";

import dsvId from "./[dsvId]";

const app = pokeApp();

app.route("/:dsvId", dsvId);

export default app;
