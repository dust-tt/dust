import { closeConversationBranch } from "@app/lib/api/assistant/conversation/branches";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches/:bId/close.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");
  const cId = c.req.param("cId") ?? "";
  const bId = c.req.param("bId") ?? "";

  const closeRes = await closeConversationBranch(auth, {
    branchId: bId,
    conversationId: cId,
  });
  if (closeRes.isErr()) {
    switch (closeRes.error.code) {
      case "branch_not_found":
        return apiError(c, {
          status_code: 404,
          api_error: { type: "branch_not_found", message: "Branch not found." },
        });
      case "conversation_not_found":
        return apiError(c, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      case "branch_write_not_authorized":
        return apiError(c, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Not authorized to modify this branch.",
          },
        });
      case "branch_not_open":
        return apiError(c, {
          status_code: 409,
          api_error: {
            type: "invalid_request_error",
            message: "Branch is not open.",
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
        assertNever(closeRes.error.code);
    }
  }

  return c.json({
    closedBranchId: bId,
    conversationDeleted: closeRes.value.conversationDeleted,
  });
});

export default app;
