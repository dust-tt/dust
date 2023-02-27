import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../auth/[...nextauth]";
import { User, App } from "../../../../../lib/models";
import { Op } from "sequelize";

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

  const readOnly = !(session && session.provider.id.toString() === user.githubId);

  let app = await App.findOne({
    where: readOnly
      ? {
          userId: user.id,
          sId: req.query.sId,
          visibility: {
            [Op.or]: ["public", "unlisted"],
          },
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
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({ app });
      break;

    case "POST":
      if (readOnly) {
        res.status(401).end();
        return;
      }

      if (
        !req.body ||
        !(typeof req.body.name == "string") ||
        !(typeof req.body.description == "string") ||
        !["public", "private", "unlisted"].includes(req.body.visibility)
      ) {
        res.status(400).end();
        break;
      }

      let description = req.body.description ? req.body.description : null;

      await app.update({
        name: req.body.name,
        description,
        visibility: req.body.visibility,
      });

      res.redirect(`/${session.user.username}/a/${app.sId}`);
      break;

    case "DELETE":
      if (readOnly) {
        res.status(401).end();
        return;
      }

      await app.update({
        visibility: "deleted",
      });

      res.status(200).end();
      break;

    default:
      res.status(405).end();
      break;
  }
}
