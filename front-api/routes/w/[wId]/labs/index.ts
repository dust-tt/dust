import { workspaceApp } from "@front-api/middlewares/ctx";
import { withFeatureFlag } from "@front-api/middlewares/with_feature_flag";

import transcripts from "./transcripts";

const app = workspaceApp();

app.use("*", withFeatureFlag("labs_transcripts"));

app.route("/transcripts", transcripts);

export default app;
