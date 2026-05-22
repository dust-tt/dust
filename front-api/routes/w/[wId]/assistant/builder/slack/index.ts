import { workspaceApp } from "@front-api/middleware/env";

import channelsLinkedWithAgent from "./channels_linked_with_agent";

// Mounted under /api/w/:wId/assistant/builder/slack.
const app = workspaceApp();

app.route("/channels_linked_with_agent", channelsLinkedWithAgent);

export default app;
