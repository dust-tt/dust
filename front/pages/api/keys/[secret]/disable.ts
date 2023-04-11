import { auth_user } from "@app/lib/auth";
import { Key } from "@app/lib/models";
import withLogging from "@app/logger/withlogging";
import { KeyType } from "@app/types/key";
import { NextApiRequest, NextApiResponse } from "next";

export type PostKeysResponseBody = {
  key: KeyType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PostKeysResponseBody>
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

  let [key] = await Promise.all([
    Key.findOne({
      where: {
        secret: req.query.secret,
        userId: auth.user().id,
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
