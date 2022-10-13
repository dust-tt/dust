import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { User, App } from "../../../../../lib/models";

export default async function handler(req, res) {
  const session = await unstable_getServerSession(req, res, authOptions);

  let user = await User.findOne({
    where: {
      username: req.query.user,
    },
  });

  if (!user) {
    res.status(404).end();
    return;
  }

  const readOnly = !(session && session.github.id.toString() === user.githubId);

  switch (req.method) {
    case "GET":
      let app = await App.findOne({
        where: readOnly
          ? {
              userId: user.id,
              sId: req.query.sId,
              visibility: "public",
            }
          : {
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

      if (!app) {
        res.status(404).json({ app });
        return;
      }

      res.status(200).json({ app });
      break;

    default:
      res.status(405).end();
      break;
  }
}
