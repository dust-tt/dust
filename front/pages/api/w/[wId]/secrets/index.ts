import type { SecretType } from "@dust-tt/types";
import { formatUserFullName } from "@dust-tt/types";
import { decrypt, encrypt } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { User } from "@app/lib/models/user";
import { Secret } from "@app/lib/models/workspace";
import { withLogging } from "@app/logger/withlogging";

export type GetSecretsResponseBody = {
  secrets: SecretType[];
};

export type PostSecretsResponseBody = {
  secret: SecretType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetSecretsResponseBody | PostSecretsResponseBody>
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
        secrets: secrets.map((s) => {
          const clearSecret = decrypt(s.hash, owner.sId);
          return {
            createdAt: s.createdAt.getTime(),
            creator: formatUserFullName(s.user),
            name: s.name,
            value: clearSecret,
          };
        }),
      });
      return;

    case "DELETE":
      const secretId = req.body.id;
      const secret = await Secret.findOne({
        where: {
          id: secretId,
          workspaceId: owner.id,
        },
      });

      if (!secret) {
        res.status(404).end();
        return;
      }

      await secret.destroy();

      res.status(204).end();
      return;

    case "POST":
      const secretName = req.body.name;
      const secretValue = req.body.value;
      // We feed the workspace sid as key that will be added to the salt.
      const hashValue = encrypt(secretValue, owner.sId);

      const key = await Secret.create({
        userId: user?.id,
        workspaceId: owner.id,
        name: secretName,
        hash: hashValue,
      });

      res.status(201).json({
        secret: {
          createdAt: key.createdAt.getTime(),
          creator: formatUserFullName(key.user),
          name: secretName,
          value: secretValue,
        },
      });
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
