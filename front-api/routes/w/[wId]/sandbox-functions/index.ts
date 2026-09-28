import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFramesV2FunctionsFeature } from "@front-api/middlewares/with_frames_v2_functions_feature";

import functionId from "./[functionId]";

const app = workspaceApp();

app.use("*", withFramesV2FunctionsFeature());

app.route("/:functionIdOrSlug", functionId);

export default app;
