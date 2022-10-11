import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { User } from "../../../../lib/models";
import { App } from "../../../../lib/models";

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
      let app = await App.findOne({
        where: {
          userId: user.id,
          sId: req.query.sId,
        },
        attributes: [
          "id",
          "uId",
          "sId",
          "name",
          "description",
          "visibility",
          "savedSpecification",
          "savedConfig",
          "savedRun",
          "updatedAt",
        ],
      });

      res.status(200).json({ app });
      break;

    default:
      res.status(405).end();
      break;
  }
}
