import { getMostRecentOpenBranchForConversation } from "@app/lib/api/assistant/conversation/branches";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

import branch from "./[bId]";

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches.
const app = new Hono();

app.get("/", async (c) => {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";

  const branchRes = await getMostRecentOpenBranchForConversation(auth, {
    conversationId: cId,
  });
  if (branchRes.isErr()) {
    switch (branchRes.error.code) {
      case "conversation_not_found":
        return apiError(c, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      case "internal_error":
        return apiError(c, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      default:
        assertNever(branchRes.error.code);
    }
  }

  return c.json({ branch: branchRes.value });
});

app.route("/:bId", branch);

export default app;
