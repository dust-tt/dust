import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Key } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";
import { KeyType } from "@app/types/key";

export type PostKeysResponseBody = {
  key: KeyType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostKeysResponseBody>
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

  const [key] = await Promise.all([
    Key.findOne({
      where: {
        secret: req.query.secret,
        workspaceId: owner.id,
      },
    }),
  ]);

  if (!key) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
      await key.update({
        status: "disabled",
      });

      res.status(200).json({
        key: {
          secret: key.secret,
          status: key.status,
          isSystem: key.isSystem,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
