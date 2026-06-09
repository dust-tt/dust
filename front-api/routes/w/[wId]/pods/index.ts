import { workspaceApp } from "@front-api/middlewares/ctx";
import podId from "./[podId]";

const app = workspaceApp();

app.route("/:podId", podId);

export default app;
