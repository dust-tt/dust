import { getSession as getAuth0Session } from "@auth0/nextjs-auth0";
import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getBearerToken } from "@app/lib/auth";
import { getPendingMembershipInvitationWithWorkspaceForEmail } from "@app/lib/iam/invitations";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { Workspace } from "@app/lib/models/workspace";
import { apiError, withLogging } from "@app/logger/withlogging";

type BaseLookupResponse = {
  isNew: boolean;
};

type UserLookupResponse = BaseLookupResponse & {
  hasInvite: boolean;
  hasAutoJoinWorkspace: boolean;
  workspaceId?: string;
};

type WorkspaceLookupResponse = BaseLookupResponse;

const ExternalUserCodec = t.type({
  email: t.string,
  email_verified: t.boolean,
  name: t.string,
  nickname: t.string,
  sub: t.string,
  family_name: t.union([t.string, t.undefined]),
  given_name: t.union([t.string, t.undefined]),
  picture: t.union([t.string, t.undefined]),
});

type LookupResponseBody = UserLookupResponse | WorkspaceLookupResponse;

const UserLookupSchema = t.type({
  user: ExternalUserCodec,
});

const WorkspaceLookupSchema = t.type({
  workspace: t.string,
});

const ResourceType = t.union([t.literal("user"), t.literal("workspace")]);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<LookupResponseBody>>
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "Only POST requests are supported",
      },
    });
  }

  const bearerTokenRes = await getBearerToken(req);
  if (bearerTokenRes.isErr()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The request does not have valid authentication credentials",
      },
    });
  }

  if (bearerTokenRes.value !== config.getLookUpBearerToken()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_basic_authorization_error",
        message: "Invalid token",
      },
    });
  }
  const { resource } = req.query;
  if (!resource || typeof resource !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Missing or invalid resource parameter",
      },
    });
  }

  const resourceValidation = ResourceType.decode(resource);
  if (isLeft(resourceValidation)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid resource type. Must be 'user' or 'workspace'",
      },
    });
  }

  let response: LookupResponseBody | null = null;
  switch (resourceValidation.right) {
    case "user":
      {
        const bodyValidation = UserLookupSchema.decode(req.body);
        if (isLeft(bodyValidation)) {
          const pathError = reporter.formatValidationErrors(
            bodyValidation.left
          );
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: `Invalid request body for user lookup: ${pathError}`,
            },
          });
        }
        response = await handleLookupUser(bodyValidation.right);
        const session = await getAuth0Session(req, res);
        const sessionWithUser = {
          user: bodyValidation.right.user,
          session,
        };
        response = await handleLookupUser(sessionWithUser);
      }
      break;
    case "workspace": {
      const bodyValidation = WorkspaceLookupSchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body for user lookup ${pathError}`,
          },
        });
      }
      response = await handleLookupWorkspace(bodyValidation.right);
    }
  }
  res.status(200).json(response);
  return;
}

async function handleLookupUser(
  body: SessionWithUser
): Promise<UserLookupResponse> {
  // Check if user exists
  const user = await fetchUserFromSession(body);

  // Check for pending invitations
  const pendingInvite =
    await getPendingMembershipInvitationWithWorkspaceForEmail(body.user.email);

  // Check for workspace with verified domain
  const workspaceWithVerifiedDomain =
    await findWorkspaceWithVerifiedDomain(body);

  // Check auto-join
  const canAutoJoin =
    workspaceWithVerifiedDomain?.domainAutoJoinEnabled ?? false;

  return {
    isNew: !user,
    hasInvite: !!pendingInvite,
    hasAutoJoinWorkspace: canAutoJoin,
    workspaceId:
      pendingInvite?.workspace.sId ||
      (canAutoJoin ? workspaceWithVerifiedDomain?.workspace?.sId : undefined),
  };
}

async function handleLookupWorkspace(
  body: t.TypeOf<typeof WorkspaceLookupSchema>
): Promise<WorkspaceLookupResponse> {
  const workspace = await Workspace.findOne({
    where: { sId: body.workspace },
  });
  return {
    isNew: !!workspace,
  };
}

export default withLogging(handler);
