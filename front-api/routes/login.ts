import { performLogin } from "@app/lib/api/login";
import { extractUTMParams } from "@app/lib/utils/utm";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { sessionAuthApp } from "@front-api/middleware/env";
import { sessionAuth } from "@front-api/middleware/session_auth";
import { apiError } from "@front-api/middleware/utils";

const app = sessionAuthApp();

app.use("*", sessionAuth);

app.get("/", async (ctx) => {
  const session = ctx.get("session");
  const { inviteToken, wId, join, cId } = ctx.req.query();
  const utmParams = extractUTMParams(ctx.req.query());

  const outcome = await performLogin(
    {
      cookieHeader: ctx.req.header("cookie"),
      forwardedFor: ctx.req.header("x-forwarded-for"),
      remoteAddress: undefined,
    },
    session,
    {
      inviteToken: isString(inviteToken) ? inviteToken : null,
      wId: isString(wId) ? wId : null,
      utmParams,
      join: join === "true",
      conversationId: isString(cId) ? cId : null,
      returnTo: null,
    }
  );

  switch (outcome.kind) {
    case "redirect":
      // Next's `res.redirect()` defaults to 307; match it here.
      return ctx.redirect(outcome.url, 307);
    case "unauthorized":
      return ctx.body(null, 401);
    case "apiError":
      return apiError(ctx, outcome.error);
    default:
      assertNever(outcome);
  }
});

export default app;
