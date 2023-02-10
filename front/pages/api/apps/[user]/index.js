import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { User, App } from "../../../../lib/models";
import { new_id } from "../../../../lib/utils";
import { Op } from "sequelize";

const { DUST_API } = process.env;

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
      const where = readOnly
        ? {
            userId: user.id,
            // Do not include 'unlisted' here.
            visibility: "public",
          }
        : {
            userId: user.id,
            visibility: {
              [Op.or]: ["public", "private", "unlisted"],
            },
          };
      let apps = await App.findAll({
        where,
        order: [["updatedAt", "DESC"]],
        attributes: [
          "id",
          "uId",
          "sId",
          "name",
          "description",
          "visibility",
          "updatedAt",
        ],
      });

      res.status(200).json({ apps });
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

      const r = await fetch(`${DUST_API}/projects`, {
        method: "POST",
      });
      const p = await r.json();
      if (p.error) {
        res.status(500).end();
        break;
      }

      let description = req.body.description ? req.body.description : null;
      let uId = new_id();

      let app = await App.create({
        uId,
        sId: uId.slice(0, 10),
        name: req.body.name,
        description,
        visibility: req.body.visibility,
        userId: user.id,
        dustAPIProjectId: p.response.project.project_id,
      });

      res.redirect(`/${session.user.username}/a/${app.sId}`);
      break;

    default:
      res.status(405).end();
      break;
  }
}
