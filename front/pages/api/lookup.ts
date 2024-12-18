import type { WithAPIErrorResponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { getBearerToken } from "@app/lib/auth";
import { getPendingMembershipInvitationWithWorkspaceForEmail } from "@app/lib/iam/invitations";
import { fetchUserFromSession } from "@app/lib/iam/users";
import { findWorkspaceWithVerifiedDomain } from "@app/lib/iam/workspaces";
import { apiError, withLogging } from "@app/logger/withlogging";

const { LOOKUP_API_SECRET } = process.env;

if (!LOOKUP_API_SECRET) {
  throw new Error("LOOKUP_API_SECRET is not defined");
}

export type UserLookupResponseBody = {
  isNew: boolean;
  hasInvite: boolean;
  hasAutoJoinWorkspace: boolean;
  workspaceId?: string;
};

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

const LookupRequestBodySchema = t.type({
  user: ExternalUserCodec,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<UserLookupResponseBody>>
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

  if (bearerTokenRes.value !== LOOKUP_API_SECRET) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "invalid_basic_authorization_error",
        message: "Invalid token",
      },
    });
  }

  const queryValidation = LookupRequestBodySchema.decode(req.body);
  if (isLeft(queryValidation)) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid request body",
      },
    });
  }
  const session = queryValidation.right;

  // Check if user exists
  const user = await fetchUserFromSession(session);
  const isNew = !!user;

  // Check for pending invitations
  const pendingInvite =
    await getPendingMembershipInvitationWithWorkspaceForEmail(
      session.user.email
    );

  // Check for workspace with verified domain
  const workspaceWithVerifiedDomain =
    await findWorkspaceWithVerifiedDomain(session);

  // Check auto-join
  const canAutoJoin =
    workspaceWithVerifiedDomain?.domainAutoJoinEnabled ?? false;

  res.status(200).json({
    isNew,
    hasInvite: !!pendingInvite,
    hasAutoJoinWorkspace: canAutoJoin,
    workspaceId:
      pendingInvite?.workspace.sId ||
      (canAutoJoin ? workspaceWithVerifiedDomain?.workspace?.sId : undefined),
  });
  return;
}

export default withLogging(handler);
