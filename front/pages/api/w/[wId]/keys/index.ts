import type { KeyType, WithAPIErrorReponse } from "@dust-tt/types";
import { formatUserFullName, redactString } from "@dust-tt/types";
import { isLeft } from "fp-ts/Either";
import * as t from "io-ts";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { User } from "@app/lib/models/user";
import { Key } from "@app/lib/models/workspace";
import { new_id } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";

export type GetKeysResponseBody = {
  keys: KeyType[];
};

export type PostKeysResponseBody = {
  key: KeyType;
};

const CreateKeyPostBodySchema = t.type({
  name: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorReponse<GetKeysResponseBody | PostKeysResponseBody>
  >
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
          const currentTime = new Date();
          const createdAt = new Date(k.createdAt);
          const timeDifference = Math.abs(
            currentTime.getTime() - createdAt.getTime()
          );
          const differenceInMinutes = Math.ceil(timeDifference / (1000 * 60));
          const secret =
            differenceInMinutes > 10 ? redactString(k.secret, 4) : k.secret;

          return {
            id: k.id,
            createdAt: k.createdAt.getTime(),
            lastUsedAt: k.lastUsedAt?.getTime() ?? null,
            creator: formatUserFullName(k.user),
            name: k.name,
            secret,
            status: k.status,
          };
        }),
      });
      return;

    case "POST":
      const bodyValidation = CreateKeyPostBodySchema.decode(req.body);
      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }
      const { name } = bodyValidation.right;
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
          id: key.id,
          createdAt: key.createdAt.getTime(),
          creator: formatUserFullName(key.user),
          lastUsedAt: null,
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
