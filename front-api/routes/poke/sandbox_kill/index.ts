import { Hono } from "hono";

import images from "./images";

const app = new Hono();

app.route("/images", images);

export default app;
