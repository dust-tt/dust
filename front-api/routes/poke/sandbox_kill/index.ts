import { pokeApp } from "@front-api/middlewares/ctx";

import images from "./images";
import request from "./request";

const app = pokeApp();

app.route("/images", images);
app.route("/request", request);

export default app;
