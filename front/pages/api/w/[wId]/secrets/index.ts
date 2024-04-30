import type { SecretType } from "@dust-tt/types";
import { formatUserFullName } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { User } from "@app/lib/models/user";
import { Secret } from "@app/lib/models/workspace";
import { new_id } from "@app/lib/utils";
import { withLogging } from "@app/logger/withlogging";

export type GetSecretsResponseBody = {
  keys: SecretType[];
};

export type PostKeysResponseBody = {
  key: SecretType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetSecretsResponseBody | PostKeysResponseBody>
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
      const secrets = await Secret.findAll({
        attributes: ["createdAt", "name", "hash", "userId"],
        where: {
          workspaceId: owner.id,
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
        keys: secrets.map((s) => {
          const decipheredSecret = s.hash;
          return {
            createdAt: s.createdAt.getTime(),
            creator: formatUserFullName(s.user),
            name: s.name,
            value: decipheredSecret,
          };
        }),
      });
      return;

    case "POST":
      const secret = `sk-${new_id().slice(0, 32)}`;

      const key = await Key.create({
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
