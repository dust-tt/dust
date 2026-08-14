import { workspaceApp } from "@front-api/middlewares/ctx";

import channelsLinkedWithAgent from "./channels_linked_with_agent";
import userPrivateChannels from "./user_private_channels";

// Mounted under /api/w/:wId/assistant/builder/slack.
const app = workspaceApp();

app.route("/channels_linked_with_agent", channelsLinkedWithAgent);
app.route("/user_private_channels", userPrivateChannels);

export default app;
