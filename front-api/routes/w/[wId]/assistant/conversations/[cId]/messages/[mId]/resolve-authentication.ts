import { makeResolveAuthenticationApp } from "@front-api/lib/api/assistant/conversation/resolve_authentication";

// Mounted at
// /api/w/:wId/assistant/conversations/:cId/messages/:mId/resolve-authentication.
const app = makeResolveAuthenticationApp("authentication", "authentication");

export default app;
