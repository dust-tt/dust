import { Hono } from "hono";

import conversation from "./[cId]";
import bulkActions from "./bulk-actions";
import search from "./search";
import semanticSearch from "./semantic_search";
import sendOnboarding from "./send-onboarding";
import spaces from "./spaces";

// Mounted under /api/w/:wId/assistant/conversations.
const app = new Hono();

// Register static paths BEFORE `/:cId` so the param route does not swallow
// these names as conversation ids.
app.route("/bulk-actions", bulkActions);
app.route("/search", search);
app.route("/semantic_search", semanticSearch);
app.route("/send-onboarding", sendOnboarding);
app.route("/spaces", spaces);
app.route("/:cId", conversation);

export default app;
