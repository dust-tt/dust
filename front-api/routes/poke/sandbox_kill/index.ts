import { pokeApp } from "@front-api/middleware/env";

import images from "./images";

const app = pokeApp();

app.route("/images", images);

export default app;
