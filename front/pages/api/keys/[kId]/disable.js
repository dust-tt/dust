import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { User, Key } from "../../../../lib/models";

export default async function handler(req, res) {
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

  let [key] = await Promise.all([
    Key.findOne({
      where: {
        id: req.query.kId,
        userId: user.id,
      },
    }),
  ]);

  if (!key || key.userId != user.id) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "POST":
      await key.update({
        status: "disabled",
      });
      res.status(200).json({ key });
    default:
      res.status(405).end();
      break;
  }
}
