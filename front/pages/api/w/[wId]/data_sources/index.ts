import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { DataSource, Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";
import { NextApiRequest, NextApiResponse } from "next";

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDataSourcesResponseBody>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    res.status(404).end();
    return;
  }

  let dataSources = await getDataSources(auth);

  switch (req.method) {
    case "GET":
      res.status(200).json({ dataSources });
      return;

    case "POST":
      if (!auth.isBuilder()) {
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

      // Enforce plan limits: DataSources count.
      if (dataSources.length >= owner.plan.limits.dataSources.count) {
        res.status(400).end();
        return;
      }

      const dustProject = await DustAPI.createProject();
      if (dustProject.isErr()) {
        res.status(500).end();
        return;
      }

      let description = req.body.description ? req.body.description : null;
      let maxChunkSize = parseInt(req.body.max_chunk_size);
      if (isNaN(maxChunkSize)) {
        res.status(400).end();
        return;
      }

      const [providers] = await Promise.all([
        Provider.findAll({
          where: {
            workspaceId: owner.id,
          },
        }),
      ]);
      let credentials = credentialsFromProviders(providers);

      const dustDataSource = await DustAPI.createDataSource(
        dustProject.value.project.project_id.toString(),
        {
          dataSourceId: req.body.name as string,
          config: {
            provider_id: req.body.provider_id as string,
            model_id: req.body.model_id as string,
            splitter_id: "base_v0",
            max_chunk_size: maxChunkSize,
            use_cache: false,
          },
          credentials,
        }
      );

      if (dustDataSource.isErr()) {
        res.status(500).end();
        return;
      }

      await DataSource.create({
        name: req.body.name,
        description: description,
        visibility: req.body.visibility,
        config: JSON.stringify(dustDataSource.value.data_source.config),
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        workspaceId: owner.id,
      });

      res.redirect(`/${owner.sId}/ds/${req.body.name}`);
      return;

    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
