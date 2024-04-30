import type { KeyType } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Key } from "@app/lib/models/workspace";
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
        id: req.query.id,
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
          id: key.id,
          createdAt: key.createdAt.getTime(),
          creator: null,
          lastUsedAt: key.lastUsedAt?.getTime() || null,
          secret: key.secret,
          status: key.status,
          name: key.name,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
