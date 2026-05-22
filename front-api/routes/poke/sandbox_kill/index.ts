import { pokeApp } from "@front-api/middlewares/ctx";

import images from "./images";

const app = pokeApp();

app.route("/images", images);

export default app;
