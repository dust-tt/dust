import { publicApiApp } from "@front-api/middlewares/ctx";

import runs from "./runs";

const app = publicApiApp();

app.route("/runs", runs);

export default app;
