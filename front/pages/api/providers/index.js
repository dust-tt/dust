import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import { User, Provider } from "../../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);
  if (!session) {
    res.status(401).end();
    return;
  }
  let user = await User.findOne({
    where: {
      githubId: session.github.id,
    },
  });
  if (!user) {
    res.status(401).end();
    return;
  }

  switch (req.method) {
    case "GET":
      let providers = await Provider.findAll({
        where: {
          userId: user.id,
        },
      });

      res.status(200).json({ providers });
      break;

    default:
      res.status(405).end();
      break;
  }
}
