import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "@app/pages/api/auth/[...nextauth]";
import { User, DataSource } from "@app/lib/models";
import { Op } from "sequelize";
import withLogging from "@app/logger/withlogging";

const { DUST_API } = process.env;

async function handler(req, res) {
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

  const readOnly = !(
    session && session.provider.id.toString() === user.githubId
  );

  let dataSource = await DataSource.findOne({
    where: readOnly
      ? {
          userId: user.id,
          name: req.query.name,
          visibility: {
            [Op.or]: ["public"],
          },
        }
      : {
          userId: user.id,
          name: req.query.name,
        },
    attributes: [
      "id",
      "name",
      "description",
      "visibility",
      "config",
      "dustAPIProjectId",
      "updatedAt",
    ],
  });

  if (!dataSource) {
    res.status(404).end();
    return;
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({ dataSource });
      break;

    case "POST":
      if (readOnly) {
        res.status(401).end();
        break;
      }

      if (
        !req.body ||
        !(typeof req.body.description == "string") ||
        !["public", "private"].includes(req.body.visibility)
      ) {
        res.status(400).end();
        break;
      }

      let description = req.body.description ? req.body.description : null;

      await dataSource.update({
        description,
        visibility: req.body.visibility,
      });

      res.redirect(`/${session.user.username}/ds/${dataSource.name}`);
      break;

    case "DELETE":
      if (readOnly) {
        res.status(401).end();
        break;
      }

      const dsRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}`,
        {
          method: "DELETE",
        }
      );

      const dustDataSource = await dsRes.json();
      if (dustDataSource.error) {
        res.status(500).end();
        break;
      }

      await dataSource.destroy();

      res.status(200).end();
      break;

    default:
      res.status(405).end();
      break;
  }
}

export default withLogging(handler);
