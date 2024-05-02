import type { SecretType } from "@dust-tt/types";
import { decrypt, encrypt } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
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
        where: {
          workspaceId: owner.id,
        },
        order: [["name", "DESC"]],
      });

      res.status(200).json({
        secrets: secrets.map((s) => {
          const clearSecret = decrypt(s.hash, owner.sId);
          return {
            createdAt: s.createdAt.getTime(),
            name: s.name,
            value: clearSecret,
          };
        }),
      });
      return;

    case "DELETE":
      const { name: deleteSecretName } = req.body;
      const secret = await Secret.findOne({
        where: {
          name: deleteSecretName,
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
      const { name: postSecretName } = req.body;
      const secretValue = req.body.value;

      const hashValue = encrypt(secretValue, owner.sId); // We feed the workspace sid as key that will be added to the salt.

      await Secret.create({
        userId: user?.id,
        workspaceId: owner.id,
        name: postSecretName,
        hash: hashValue,
      });

      res.status(201).json({
        secret: {
          name: postSecretName,
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
