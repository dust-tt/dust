import { mergeConversationBranch } from "@app/lib/api/assistant/conversation/branches";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches/:bId/merge.
const app = workspaceApp();

app.post("/", async (ctx) => {
  const auth = ctx.get("auth");
  const cId = ctx.req.param("cId") ?? "";
  const bId = ctx.req.param("bId") ?? "";

  const mergeRes = await mergeConversationBranch(auth, {
    branchId: bId,
    conversationId: cId,
  });
  if (mergeRes.isErr()) {
    switch (mergeRes.error.code) {
      case "branch_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: { type: "branch_not_found", message: "Branch not found." },
        });
      case "conversation_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
          },
        });
      case "branch_write_not_authorized":
        return apiError(ctx, {
          status_code: 403,
          api_error: {
            type: "workspace_auth_error",
            message: "Not authorized to modify this branch.",
          },
        });
      case "branch_not_open":
        return apiError(ctx, {
          status_code: 409,
          api_error: {
            type: "invalid_request_error",
            message: "Branch is not open.",
          },
        });
      case "branch_has_no_user_message":
      case "internal_error":
        return apiError(ctx, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Internal server error",
          },
        });
      default:
        assertNever(mergeRes.error.code);
    }
  }

  return ctx.json({
    mergedUserMessageId: mergeRes.value.mergedUserMessageId,
    mergedAgentMessageIds: mergeRes.value.mergedAgentMessageIds,
  });
});

export default app;
