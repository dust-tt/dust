import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import frameId from "./[frameId]";

const app = workspaceApp();

app.use(
  "*",
  withFeatureFlag("frames_v2", {
    message: "Frames v2 are not enabled for this workspace.",
  })
);

app.route("/:frameId", frameId);

export default app;
