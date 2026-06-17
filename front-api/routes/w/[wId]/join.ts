import config from "@app/lib/api/config";
import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { fetchUsersFromWorkOSWithEmails } from "@app/lib/api/workos/user";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type { GetJoinResponseBody, OnboardingType } from "@app/lib/signup";
import { getSignInUrl } from "@app/lib/signup";
import { getMembershipInvitationTokenCookie } from "@app/lib/utils/invitation_token";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { isString } from "@app/types/shared/utils/general";
import { createHono } from "@front-api/lib/hono";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { Context } from "hono";
import { z } from "zod";

const ParamsSchema = z.object({
  wId: z.string(),
});

const JoinBodySchema = z.object({
  t: z.string().nullable().optional(),
  cId: z.string().nullable().optional(),
});

interface GetJoinErrorBody {
  redirectUrl: string;
}

// Mounted at /api/w/:wId/join (no workspace auth — public endpoint).
const app = createHono();

/** @ignoreswagger */
app.get(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<GetJoinResponseBody | GetJoinErrorBody> => {
    const { wId } = ctx.req.valid("param");
    const { cId } = ctx.req.query();

    return handleJoin(ctx, {
      wId,
      token: null,
      conversationId: isString(cId) ? cId : null,
    });
  }
);

/** @ignoreswagger */
app.post(
  "/",
  validate("param", ParamsSchema),
  validate("json", JoinBodySchema),
  async (ctx): HandlerResult<GetJoinResponseBody | GetJoinErrorBody> => {
    const { wId } = ctx.req.valid("param");
    const { t, cId } = ctx.req.valid("json");

    return handleJoin(ctx, {
      wId,
      token: isString(t) ? t : null,
      conversationId: isString(cId) ? cId : null,
    });
  }
);

async function handleJoin(
  ctx: Context,
  {
    wId,
    token,
    conversationId,
  }: { wId: string; token: string | null; conversationId: string | null }
): HandlerResult<GetJoinResponseBody | GetJoinErrorBody> {
  const workspaceResource = await WorkspaceResource.fetchById(wId);
  const maintenance = workspaceResource?.metadata?.maintenance;

  if (!workspaceResource || maintenance === "relocation-done") {
    // If workspace not found locally, lookup in other region.
    const redirect = await getWorkspaceRegionRedirect(wId);

    if (redirect) {
      return ctx.json(
        {
          error: {
            type: "workspace_in_different_region",
            message: "Workspace is located in a different region",
            redirect,
          },
        },
        400
      );
    }

    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const workspace = renderLightWorkspaceType({
    workspace: workspaceResource,
  });
  const workspaceDomains = await workspaceResource.getVerifiedDomains();

  let onboardingType: OnboardingType;
  if (conversationId) {
    onboardingType = "domain_conversation_link";
  } else if (token) {
    onboardingType = "email_invite";
  } else {
    onboardingType = "domain_invite_link";
  }

  // Return 404 if in a flow where we need a verified domain and there is none.
  if (
    !workspaceDomains.some((d) => d.domainAutoJoinEnabled) &&
    ["domain_conversation_link", "domain_invite_link"].includes(onboardingType)
  ) {
    return apiError(ctx, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message:
          "The workspace does not have a verified domain with auto-join enabled.",
      },
    });
  }

  let signUpCallbackUrl: string | undefined = undefined;
  let invitationEmail: string | null = null;

  switch (onboardingType) {
    case "domain_conversation_link":
      signUpCallbackUrl = `/api/login?wId=${wId}&cId=${conversationId}&join=true`;
      break;
    case "email_invite": {
      signUpCallbackUrl = "/api/login";
      const result = await MembershipInvitationResource.getPendingForToken(
        token ?? undefined
      );
      if (result.isErr()) {
        return ctx.json(
          {
            redirectUrl: `${config.getApiBaseUrl()}/api/workos/logout?returnTo=/login-error${encodeURIComponent(`?type=email-invite&reason=${result.error.code}`)}`,
          },
          400
        );
      }

      if (result.value) {
        invitationEmail = result.value.inviteEmail;
      }
      break;
    }
    case "domain_invite_link":
      signUpCallbackUrl = `/api/login?wId=${wId}`;
      break;
  }

  const users = await fetchUsersFromWorkOSWithEmails([invitationEmail ?? ""]);
  const userExists = users.length > 0;

  const signInUrl = getSignInUrl({
    signupCallbackUrl: signUpCallbackUrl,
    invitationEmail: invitationEmail ?? undefined,
    userExists,
  });

  if (token) {
    ctx.header("Set-Cookie", getMembershipInvitationTokenCookie(token), {
      append: true,
    });
  }

  return ctx.json({
    onboardingType,
    workspace,
    signInUrl,
    userExists,
  });
}

export default app;
