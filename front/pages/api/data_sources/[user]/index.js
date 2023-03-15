import { unstable_getServerSession } from "next-auth/next";
import { authOptions } from "../../auth/[...nextauth]";
import { User, DataSource } from "../../../../lib/models";
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
    res.status(200).json({ dataSources: [] });
    return;
  }

  const readOnly = !(
    session && session.provider.id.toString() === user.githubId
  );

  const where = readOnly
    ? {
        userId: user.id,
        // Do not include 'unlisted' here.
        visibility: "public",
      }
    : {
        userId: user.id,
        visibility: {
          [Op.or]: ["public", "private"],
        },
      };
  let dataSources = await DataSource.findAll({
    where,
    order: [["updatedAt", "DESC"]],
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

  switch (req.method) {
    case "GET":
      res.status(200).json({ dataSources });
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
        !(typeof req.body.provider_id == "string") ||
        !(typeof req.body.model_id == "string") ||
        !(typeof req.body.max_chunk_size == "string") ||
        !["public", "private"].includes(req.body.visibility)
      ) {
        res.status(400).end();
        break;
      }

      // Enforce FreePlan limit: 1 DataSource.
      if (dataSources.length >= 1) {
        res.status(400).end();
        break;
      }

      const pRes = await fetch(`${DUST_API}/projects`, {
        method: "POST",
      });
      const dustProject = await pRes.json();
      if (dustProject.error) {
        res.status(500).end();
        break;
      }

      let description = req.body.description ? req.body.description : null;
      let maxChunkSize = parseInt(req.body.max_chunk_size);
      if (isNaN(maxChunkSize)) {
        res.status(400).end();
        break;
      }

      const dsRes = await fetch(
        `${DUST_API}/projects/${dustProject.response.project.project_id}/data_sources`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            data_source_id: req.body.name,
            config: {
              provider_id: req.body.provider_id,
              model_id: req.body.model_id,
              splitter_id: "base_v0",
              max_chunk_size: maxChunkSize,
              use_cache: false,
            },
          }),
        }
      );
      const dustDataSource = await dsRes.json();
      if (dustDataSource.error) {
        res.status(500).end();
        break;
      }

      let ds = await DataSource.create({
        name: req.body.name,
        description: description,
        visibility: req.body.visibility,
        config: JSON.stringify(dustDataSource.response.data_source.config),
        dustAPIProjectId: dustProject.response.project.project_id,
        userId: user.id,
      });

      res.redirect(`/${session.user.username}/ds/${req.body.name}`);
      break;

    default:
      res.status(405).end();
      break;
  }
}
