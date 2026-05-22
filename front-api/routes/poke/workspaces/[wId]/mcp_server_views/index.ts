import { pokeApp } from "@front-api/middlewares/ctx";

import svId from "./[svId]";

const app = pokeApp();

app.route("/:svId", svId);

export default app;
