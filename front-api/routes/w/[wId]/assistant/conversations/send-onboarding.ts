import { createOnboardingConversationIfNeeded } from "@app/lib/api/assistant/onboarding";
import { isString } from "@app/types/shared/utils/general";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

// Mounted at /api/w/:wId/assistant/conversations/send-onboarding.
const app = new Hono();

app.post("/", async (c) => {
  const auth = c.get("auth");

  const body = await c.req.json().catch(() => ({}));

  // Accept language from body or fall back to Accept-Language header.
  const acceptLanguage = c.req.header("accept-language");
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
    return apiError(c, result.error);
  }

  return c.json({ conversationId: result.value });
});

export default app;
