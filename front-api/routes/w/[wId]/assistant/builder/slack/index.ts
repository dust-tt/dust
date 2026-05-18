import { Hono } from "hono";

import channelsLinkedWithAgent from "./channels_linked_with_agent";

// Mounted under /api/w/:wId/assistant/builder/slack.
const app = new Hono();

app.route("/channels_linked_with_agent", channelsLinkedWithAgent);

export default app;
