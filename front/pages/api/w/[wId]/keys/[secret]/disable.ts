import { KeyType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Key } from "@app/lib/models";
import { withLogging } from "@app/logger/withlogging";

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
          createdAt: key.createdAt.getTime(),
          creator: null,
          secret: key.secret,
          status: key.status,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
