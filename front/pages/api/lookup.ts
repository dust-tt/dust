import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { getBearerToken } from "@app/lib/auth";
import { getPendingMembershipInvitationWithWorkspaceForEmail } from "@app/lib/iam/invitations";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { Workspace } from "@app/lib/models/workspace";
import { apiError, withLogging } from "@app/logger/withlogging";

export type BaseLookupResponse = {
  isNew: boolean;
};

export type UserLookupResponse = BaseLookupResponse & {
  hasInvite: boolean;
  hasAutoJoinWorkspace: boolean;
  workspaceId?: string;
};

export type WorkspaceLookupResponse = BaseLookupResponse;

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

export type LookupResponseBody = UserLookupResponse | WorkspaceLookupResponse;

const UserLookupSchema = t.type({
  resource: t.literal("user"),
  user: ExternalUserCodec,
});

const WorkspaceLookupSchema = t.type({
  resource: t.literal("workspace"),
  workspace: t.string,
});

const LookupRequestBodySchema = t.union([
  UserLookupSchema,
  WorkspaceLookupSchema,
]);

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

  const bodyValidation = LookupRequestBodySchema.decode(req.body);
  if (isLeft(bodyValidation)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body",
      },
    });
  }

  const body = bodyValidation.right;

  let response: LookupResponseBody | null = null;
  switch (body.resource) {
    case "user":
      {
        response = await handleLookupUser(body);
      }
      break;
    case "workspace": {
      response = await handleLookupWorkspace(body);
    }
  }
  res.status(200).json(response);
  return;
}

async function handleLookupUser(
  body: t.TypeOf<typeof UserLookupSchema>
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
    isNew: !!user,
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
