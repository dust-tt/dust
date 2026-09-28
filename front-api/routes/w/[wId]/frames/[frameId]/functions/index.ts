import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFramesV2FunctionsFeature } from "@front-api/middlewares/with_frames_v2_functions_feature";

import functionName from "./[name]";

const app = workspaceApp();

app.use("*", withFramesV2FunctionsFeature());

app.route("/:name", functionName);

export default app;
