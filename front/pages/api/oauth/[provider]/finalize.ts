/** @ignoreswagger */
import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { finalizeConnection } from "@app/lib/api/oauth";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { OAuthConnectionType } from "@app/types/oauth/lib";
import { isOAuthProvider } from "@app/types/oauth/lib";
import type { NextApiRequest, NextApiResponse } from "next";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ connection: OAuthConnectionType }>
  >,
  session: SessionWithUser
) {
  const provider = req.query.provider;
  if (!isOAuthProvider(provider)) {
    res.status(404).end();
    return;
  }

  const auth = session.workspaceId
    ? await Authenticator.fromSession(session, session.workspaceId)
    : null;

  const cRes = await finalizeConnection(auth, provider, req.query);
  if (!cRes.isOk()) {
    res.status(500).json({
      error: {
        type: "internal_server_error",
        message: cRes.error.message,
      },
    });
    return;
  }

  res.status(200).json({ connection: cRes.value });
}

export default withSessionAuthentication(handler);
