import { Key, User } from "@app/lib/models";
import { new_id } from "@app/lib/utils";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { NextApiRequest, NextApiResponse } from "next";
import { unstable_getServerSession } from "next-auth/next";

type KeyObject = {
  id: number;
  secret: string;
  status: string;
  userId: number;
};

export type GetKeysResponseBody = {
  keys: KeyObject[];
};

export type PostKeysResponseBody = {
  key: KeyObject;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetKeysResponseBody | PostKeysResponseBody>
) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }
  let user = await User.findOne({
    where: {
      githubId: session.provider.id.toString(),
    },
  });
  if (!user) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let keys = await Key.findAll({
        where: {
          userId: user.id,
        },
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json({ keys });
      break;

    case "POST":
      let secret = `sk-${new_id().slice(0, 32)}`;

      let key = await Key.create({
        userId: user.id,
        secret: secret,
        status: "active",
      });

      res.status(201).json({ key });
    default:
      res.status(405).end();
      break;
  }
}
