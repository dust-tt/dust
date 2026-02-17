import config from "@app/lib/api/config";
import { getWorkspaceRegionRedirect } from "@app/lib/api/regions/lookup";
import { fetchUsersFromWorkOSWithEmails } from "@app/lib/api/workos/user";
import { MembershipInvitationResource } from "@app/lib/resources/membership_invitation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { getSignInUrl } from "@app/lib/signup";
import { renderLightWorkspaceType } from "@app/lib/workspace";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * 3 ways to end up here:
 *
 * Case 1: "email_invite"
 *   url = /w/[wId]/join?t=[token]
 *      -> you've been invited to a workspace by email from the member management page.
 *      -> we don't care if workspace has a verified domain with auto-join enabled.
 *
 * Case 2: "domain_conversation_link"
 *   url = /w/[wId]/join?cId=[conversationId]
 *      -> you're redirected to this page from trying to access a conversation if you're not logged in and the workspace has a verified domain.
 *      -> the workspace needs to have a verified domain with auto-join enabled.
 *
 * Case 3: "domain_invite_link"
 *   url = /w/[wId]/join
 *      -> you're redirected to this page from trying to join a workspace and the workspace has a verified domain.
 *      -> the workspace needs to have a verified domain with auto-join enabled.
 */

export type OnboardingType =
  | "email_invite"
  | "domain_conversation_link"
  | "domain_invite_link";

export type GetJoinResponseBody = {
  onboardingType: OnboardingType;
  workspace: LightWorkspaceType;
  signInUrl: string;
  userExists: boolean;
};

type GetJoinErrorBody = {
  redirectUrl: string;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetJoinResponseBody | GetJoinErrorBody>
  >
): Promise<void> {
  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  const { wId, t, cId } = req.query;

  if (!isString(wId)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const workspaceResource = await WorkspaceResource.fetchById(wId);
  if (!workspaceResource) {
    // If workspace not found locally, lookup in other region.
    const redirect = await getWorkspaceRegionRedirect(wId);

    if (redirect) {
      return res.status(400).json({
        error: {
          type: "workspace_in_different_region",
          message: "Workspace is located in a different region",
          redirect,
        },
      });
    }

    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const workspace = renderLightWorkspaceType({ workspace: workspaceResource });
  const workspaceDomains = await workspaceResource.getVerifiedDomains();

  const token = isString(t) ? t : null;
  const conversationId = isString(cId) ? cId : null;

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
    return apiError(req, res, {
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
      signUpCallbackUrl = `/api/login?inviteToken=${token}`;
      const result = await MembershipInvitationResource.getPendingForToken(
        token ?? undefined
      );
      if (result.isErr()) {
        return res.status(400).json({
          redirectUrl: `${config.getClientFacingUrl()}/api/workos/logout?returnTo=/login-error${encodeURIComponent(`?type=email-invite&reason=${result.error.code}`)}`,
        });
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

  return res.status(200).json({
    onboardingType,
    workspace,
    signInUrl,
    userExists,
  });
}

export default withLogging(handler);
