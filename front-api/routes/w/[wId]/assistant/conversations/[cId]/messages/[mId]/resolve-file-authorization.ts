import { makeResolveAuthenticationApp } from "@front-api/lib/api/assistant/conversation/resolve_authentication";

// Mounted at
// /api/w/:wId/assistant/conversations/:cId/messages/:mId/resolve-file-authorization.
const app = makeResolveAuthenticationApp(
  "file_authorization",
  "file authorization"
);

export default app;
