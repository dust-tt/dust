import { KeyType } from "@dust-tt/types";
import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { Key } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { withLogging } from "@app/logger/withlogging";

export type GetKeysResponseBody = {
  keys: KeyType[];
};

export type PostKeysResponseBody = {
  key: KeyType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetKeysResponseBody | PostKeysResponseBody>
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

  switch (req.method) {
    case "GET":
      const keys = await Key.findAll({
        where: {
          workspaceId: owner.id,
          isSystem: false,
        },
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        keys: keys.map((k) => {
          return {
            secret: k.secret,
            status: k.status,
            isSystem: k.isSystem,
          };
        }),
      });
      return;

    case "POST":
      const secret = `sk-${new_id().slice(0, 32)}`;

      const key = await Key.create({
        secret: secret,
        status: "active",
        workspaceId: owner.id,
        isSystem: false,
      });

      res.status(201).json({
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
