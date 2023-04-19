import { Authenticator, getSession } from "@app/lib/auth";
import { Key } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { withLogging } from "@app/logger/withlogging";
import { KeyType } from "@app/types/key";
import { NextApiRequest, NextApiResponse } from "next";

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
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let keys = await Key.findAll({
        where: {
          workspaceId: owner.id,
        },
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        keys: keys.map((k) => {
          return {
            secret: k.secret,
            status: k.status,
          };
        }),
      });
      return;

    case "POST":
      let secret = `sk-${new_id().slice(0, 32)}`;

      let key = await Key.create({
        secret: secret,
        status: "active",
        workspaceId: owner.id,
      });

      res.status(201).json({
        key: {
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
