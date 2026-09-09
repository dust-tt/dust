import { workspaceApp } from "@front-api/middlewares/ctx";

import upload from "./upload";

const app = workspaceApp();
app.route("/upload", upload);

export default app;
