import { postNewContentFragment } from "@app/lib/api/assistant/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { InternalPostContentFragmentRequestBodySchema } from "@app/types/api/internal/assistant";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { apiErrorForConversation } from "@front-api/lib/api/assistant/conversation/helper";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";

export type PostContentFragmentResponseBody = {
  contentFragment: ContentFragmentType;
};

// Mounted at /api/w/:wId/assistant/conversations/:cId/content_fragment.
const app = new Hono();

app.post(
  "/",
  validate("json", InternalPostContentFragmentRequestBodySchema),
  async (ctx): HandlerResult<PostContentFragmentResponseBody> => {
    const auth = ctx.get("auth");
    const user = auth.getNonNullableUser();
    const cId = ctx.req.param("cId") ?? "";

    const conversationRes =
      await ConversationResource.fetchConversationWithoutContent(auth, cId);
    if (conversationRes.isErr()) {
      return apiErrorForConversation(ctx, conversationRes.error);
    }

    const conversation = conversationRes.value;
    const contentFragmentPayload = ctx.req.valid("json");

    const baseContext = {
      username: user.username,
      fullName: user.fullName(),
      email: user.email,
    };

    const contentFragmentRes = await postNewContentFragment(
      auth,
      conversation,
      contentFragmentPayload,
      {
        ...baseContext,
        profilePictureUrl: contentFragmentPayload.context.profilePictureUrl,
      }
    );
    if (contentFragmentRes.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: contentFragmentRes.error.message,
        },
      });
    }

    return ctx.json({ contentFragment: contentFragmentRes.value });
  }
);

export default app;
