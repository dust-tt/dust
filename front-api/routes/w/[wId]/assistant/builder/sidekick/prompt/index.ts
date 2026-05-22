import { workspaceApp } from "@front-api/middleware/env";

import existing from "./existing";
import shrinkWrap from "./shrink-wrap";
import template from "./template";

// Mounted under /api/w/:wId/assistant/builder/sidekick/prompt.
const app = workspaceApp();

app.route("/template", template);
app.route("/existing", existing);
app.route("/shrink-wrap", shrinkWrap);

export default app;
