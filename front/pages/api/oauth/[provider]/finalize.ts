import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthentication } from "@app/lib/api/auth_wrappers";
import { finalizeConnection } from "@app/lib/api/oauth";
import type { OAuthConnectionType, WithAPIErrorResponse } from "@app/types";
import { isOAuthProvider } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<{ connection: OAuthConnectionType }>
  >
) {
  const provider = req.query.provider;
  if (!isOAuthProvider(provider)) {
    res.status(404).end();
    return;
  }

  const cRes = await finalizeConnection(provider, req.query);
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
