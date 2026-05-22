import { pokeApp } from "@front-api/middlewares/ctx";

import suggestionId from "./[suggestionId]";

const app = pokeApp();

app.route("/:suggestionId", suggestionId);

export default app;
