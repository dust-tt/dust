import type { KeyType } from "@dust-tt/types";
import { formatUserFullName, redactString } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { User } from "@app/lib/models/user";
import { Key } from "@app/lib/models/workspace";
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
  const user = auth.user();
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
        attributes: ["createdAt", "secret", "status", "userId", "name"],
        where: {
          workspaceId: owner.id,
          isSystem: false,
        },
        order: [["createdAt", "DESC"]],
        // Remove the day we have the users on the client side.
        include: [
          {
            as: "user",
            attributes: ["firstName", "lastName"],
            model: User,
            required: false,
          },
        ],
      });

      res.status(200).json({
        keys: keys.map((k) => {
          // We only display the full secret key for the first 10 minutes after creation.
          const getSecret = () => {
            const currentTime = new Date();
            const createdAt = new Date(k.createdAt);
            const timeDifference = Math.abs(
              currentTime.getTime() - createdAt.getTime()
            );
            const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));

            if (differenceInMinutes > 10) {
              return redactString(k.secret, 4);
            } else {
              return k.secret;
            }
          };
          return {
            createdAt: k.createdAt.getTime(),
            creator: formatUserFullName(k.user),
            name: k.name,
            secret: getSecret(),
            status: k.status,
          };
        }),
      });
      return;

    case "POST":
      const name = req.body.name;
      const secret = `sk-${new_id().slice(0, 32)}`;

      const key = await Key.create({
        name: name,
        secret: secret,
        status: "active",
        userId: user?.id,
        workspaceId: owner.id,
        isSystem: false,
      });

      res.status(201).json({
        key: {
          createdAt: key.createdAt.getTime(),
          creator: formatUserFullName(key.user),
          name: key.name,
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
