import { createOnboardingConversationIfNeeded } from "@app/lib/api/assistant/onboarding";
import { isString } from "@app/types/shared/utils/general";
import { workspaceApp } from "@front-api/middleware/env";
import type { HandlerResult } from "@front-api/middleware/utils";
import { apiError } from "@front-api/middleware/utils";

export type PostSendOnboardingResponseBody = {
  conversationId: string | null;
};

// Mounted at /api/w/:wId/assistant/conversations/send-onboarding.
const app = workspaceApp();

app.post("/", async (ctx): HandlerResult<PostSendOnboardingResponseBody> => {
  const auth = ctx.get("auth");

  const body = await ctx.req.json().catch(() => ({}));

  // Accept language from body or fall back to Accept-Language header.
  const acceptLanguage = ctx.req.header("accept-language");
  const language = isString(body?.language)
    ? body.language
    : (acceptLanguage?.split(",")[0]?.split("-")[0] ?? null);

  // Only superusers can force creation (for testing purposes).
  const force = auth.isDustSuperUser() && body?.force === true;

  const result = await createOnboardingConversationIfNeeded(auth, {
    force,
    language,
  });

  if (result.isErr()) {
    return apiError(ctx, result.error);
  }

  return ctx.json({ conversationId: result.value });
});

export default app;
