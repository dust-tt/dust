import { getMostRecentOpenBranchForConversation } from "@app/lib/api/assistant/conversation/branches";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

import branch from "./[bId]";

const ParamsSchema = z.object({
  cId: z.string(),
});

// Mounted at /api/w/:wId/assistant/conversations/:cId/branches.
const app = workspaceApp();

/** @ignoreswagger */
app.get("/", validate("param", ParamsSchema), async (ctx) => {
  const auth = ctx.get("auth");
  const { cId } = ctx.req.valid("param");

  const branchRes = await getMostRecentOpenBranchForConversation(auth, {
    conversationId: cId,
  });
  if (branchRes.isErr()) {
    switch (branchRes.error.code) {
      case "conversation_not_found":
        return apiError(ctx, {
          status_code: 404,
          api_error: {
            type: "conversation_not_found",
            message: "Conversation not found.",
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
        assertNever(branchRes.error.code);
    }
  }

  return ctx.json({ branch: branchRes.value });
});

app.route("/:bId", branch);

export default app;
