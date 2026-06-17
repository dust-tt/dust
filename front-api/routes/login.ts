import { performLogin } from "@app/lib/api/login";
import { extractUTMParams } from "@app/lib/utils/utm";
import {
  getClearMembershipInvitationTokenCookie,
  MEMBERSHIP_INVITATION_TOKEN_COOKIE_NAME,
} from "@app/lib/utils/invitation_token";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";
import { sessionApp } from "@front-api/middlewares/ctx";
import { sessionAuth } from "@front-api/middlewares/session_auth";
import { apiError } from "@front-api/middlewares/utils";
import { getCookie } from "hono/cookie";

const app = sessionApp();

app.use("*", sessionAuth);

/** @ignoreswagger */
app.get("/", async (ctx) => {
  const session = ctx.get("session");
  const { inviteToken, wId, join, cId } = ctx.req.query();
  const utmParams = extractUTMParams(ctx.req.query());
  const invitationTokenFromCookie = getCookie(
    ctx,
    MEMBERSHIP_INVITATION_TOKEN_COOKIE_NAME
  );

  const clearInvitationTokenCookie = () => {
    if (invitationTokenFromCookie) {
      ctx.header("Set-Cookie", getClearMembershipInvitationTokenCookie(), {
        append: true,
      });
    }
  };

  const outcome = await performLogin(
    {
      cookieHeader: ctx.req.header("cookie"),
      forwardedFor: ctx.req.header("x-forwarded-for"),
      remoteAddress: undefined,
    },
    session,
    {
      inviteToken: isString(inviteToken)
        ? inviteToken
        : (invitationTokenFromCookie ?? null),
      wId: isString(wId) ? wId : null,
      utmParams,
      join: join === "true",
      conversationId: isString(cId) ? cId : null,
      returnTo: null,
    }
  );

  switch (outcome.kind) {
    case "redirect":
      clearInvitationTokenCookie();
      // Next's `res.redirect()` defaults to 307; match it here.
      return ctx.redirect(outcome.url, 307);
    case "unauthorized":
      clearInvitationTokenCookie();
      return ctx.body(null, 401);
    case "apiError":
      clearInvitationTokenCookie();
      return apiError(ctx, outcome.error);
    default:
      assertNever(outcome);
  }
});

export default app;
