import { auth_user, personalWorkspace } from "@app/lib/auth";
import { Key } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import withLogging from "@app/logger/withlogging";
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
  let authRes = await auth_user(req, res);

  if (authRes.isErr()) {
    res.status(authRes.error.status_code).end();
    return;
  }
  let auth = authRes.value;

  if (auth.isAnonymous()) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let keys = await Key.findAll({
        where: {
          userId: auth.user().id,
        },
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({
        keys: keys.map((k) => {
          return {
            secret: k.secret,
            status: k.status,
            isSystem: false,
          };
        }),
      });
      return;

    case "POST":
      let authOwnerRes = await personalWorkspace(auth.dbUser());
      if (authOwnerRes.isErr()) {
        res.status(authOwnerRes.error.status_code).end();
        return;
      }
      let authOwner = authOwnerRes.value;

      let secret = `sk-${new_id().slice(0, 32)}`;

      let key = await Key.create({
        secret: secret,
        status: "active",
        userId: auth.user().id,
        workspaceId: authOwner.id,
        isSystem: false,
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
