import type { DustAppSecretType } from "@dust-tt/types";
import type { WithAPIErrorReponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { DustAppSecret } from "@app/lib/models/workspace";
import { apiError, withLogging } from "@app/logger/withlogging";

export type PostDustAppSecretsResponseBody = {
  secret: DustAppSecretType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostDustAppSecretsResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  if (!auth.isBuilder()) {
    res.status(403).end();
    return;
  }

  const secret = await DustAppSecret.findOne({
    where: {
      name: req.query.name,
      workspaceId: owner.id,
    },
  });

  if (!secret) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "DELETE":
      await secret.destroy();
      res.status(204).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
      return;
  }
}

export default withLogging(handler);
