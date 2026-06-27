import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import functionId from "./[functionId]";

const app = workspaceApp();

app.use(
  "*",
  withFeatureFlag("sandbox_functions", {
    message: "Sandbox Functions are not enabled for this workspace.",
  })
);

app.route("/:functionId", functionId);

export default app;
