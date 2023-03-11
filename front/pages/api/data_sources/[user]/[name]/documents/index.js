import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../../../auth/[...nextauth]";
import { User, DataSource, Provider } from "../../../../../../lib/models";
import { Op } from "sequelize";
import { credentialsFromProviders } from "../../../../../../lib/providers";

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
      let limit = req.query.limit ? parseInt(req.query.limit) : 10;
      let offset = req.query.offset ? parseInt(req.query.offset) : 0;

      const documentsRes = await fetch(
        `${DUST_API}/projects/${dataSource.dustAPIProjectId}/data_sources/${dataSource.name}/documents?limit=${limit}&offset=${offset}`,
        {
          method: "GET",
        }
      );

      if (!documentsRes.ok) {
        const error = await documentsRes.json();
        res.status(400).json(error.error);
        break;
      }

      const documents = await documentsRes.json();

      res.status(200).json({
        documents: documents.response.documents,
        total: documents.response.total,
      });
      break;

    default:
      res.status(405).end();
      break;
  }
}
