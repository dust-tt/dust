import { DataSource, User, Provider } from "@app/lib/models";
import { auth_user, Role } from "@app/lib/auth";
import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";
import { credentialsFromProviders } from "@app/lib/providers";
import withLogging from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";

const { DUST_API } = process.env;

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDataSourcesResponseBody>
): Promise<void> {
  let [authRes, dataSourceUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error().status_code).end();
    return;
  }
  let auth = authRes.value();

  if (!dataSourceUser) {
    res.status(404).end();
    return;
  }

  let role = await auth.roleFor(dataSourceUser);

  const where =
    role === Role.ReadOnly
      ? {
          userId: dataSourceUser.id,
          // Do not include 'unlisted' here.
          visibility: "public",
        }
      : {
          userId: dataSourceUser.id,
          visibility: {
            [Op.or]: ["public", "private"],
          },
        };
  let dataSources = await DataSource.findAll({
    where,
    order: [["updatedAt", "DESC"]],
  });

  switch (req.method) {
    case "GET":
      res.status(200).json({
        dataSources: dataSources.map((ds) => {
          return {
            name: ds.name,
            description: ds.description,
            visibility: ds.visibility,
            config: ds.config,
            dustAPIProjectId: ds.dustAPIProjectId,
            updatedAt: ds.updatedAt,
          };
        }),
      });
      return;

    case "POST":
      if (role !== Role.Owner) {
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
        return;
      }

      // Enforce FreePlan limit: 1 DataSource.
      if (dataSources.length >= 1 && auth.user().username !== "spolu") {
        res.status(400).end();
        return;
      }

      const pRes = await fetch(`${DUST_API}/projects`, {
        method: "POST",
      });
      const dustProject = await pRes.json();
      if (dustProject.error) {
        res.status(500).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;
      let maxChunkSize = parseInt(req.body.max_chunk_size);
      if (isNaN(maxChunkSize)) {
        res.status(400).end();
        return;
      }

      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: auth.user().id,
          },
        }),
      ]);
      let credentials = credentialsFromProviders(providers);

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
            credentials,
          }),
        }
      );

      const dustDataSource = await dsRes.json();
      if (dustDataSource.error) {
        res.status(500).end();
        return;
      }

      let ds = await DataSource.create({
        name: req.body.name,
        description: description,
        visibility: req.body.visibility,
        config: JSON.stringify(dustDataSource.response.data_source.config),
        dustAPIProjectId: dustProject.response.project.project_id,
        userId: dataSourceUser.id,
      });

      res.redirect(`/${dataSourceUser.username}/ds/${req.body.name}`);
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
