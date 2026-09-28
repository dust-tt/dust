import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFramesV2FunctionsFeature } from "@front-api/middlewares/with_frames_v2_functions_feature";

import invocationId from "./[invocationId]";

const app = workspaceApp();

app.use("*", withFramesV2FunctionsFeature());

app.route("/:invocationId", invocationId);

export default app;
