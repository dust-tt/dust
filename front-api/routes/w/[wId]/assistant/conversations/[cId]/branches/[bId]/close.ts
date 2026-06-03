import { closeConversationBranch } from "@app/lib/api/assistant/conversation/branches";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  cId: z.string(),
  bId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches/:bId/close.
const app = workspaceApp();

app.post("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId, bId } = ctx.req.valid("param");

  const closeRes = await closeConversationBranch(auth, {
    branchId: bId,
    conversationId: cId,
  });
  if (closeRes.isErr()) {
    switch (closeRes.error.code) {
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
      case "internal_error":
        return apiError(ctx, {
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

  return ctx.json({
    closedBranchId: bId,
    conversationDeleted: closeRes.value.conversationDeleted,
  });
});

export default app;
