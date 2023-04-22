import { createSlackConnector } from "dust-connectors/lib/connectors/slack/slack";
import { DataSourceConfig } from "dust-connectors/lib/types/data_source_config";
import { NextApiRequest, NextApiResponse } from "next";

import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { DustAPI } from "@app/lib/dust_api";
import { DataSource, Key, Provider } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import { Err, Ok, Result } from "@app/lib/result";
import { new_id } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";


export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDataSourcesResponseBody>
): Promise<void> {
  console.error('0')
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
    case "POST":
      if (!auth.isBuilder()) {
        return apiError(req, res, {
          status_code: 401,
          api_error: {
            type: "app_auth_error",
            message:
              "Only the users that are `builders` for the current workspace can create a data source.",
          },
        });
      }

      const dataSourceName = "Slack (managed)";
      const dataSoruceDescription = "Slack (managed)";
      const dataSourceProdiverId = "openai";
      const dataSourceModelId = "text-embedding-ada-002";
      const dataSourceMaxChunkSize = 512;

      if (
        !req.body.nangoConnectionId ||
        typeof req.body.nangoConnectionId !== "string"
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The request body is invalid, expects \
               { nangoConnectionId: string }.",
          },
        });
      }

      // Enforce plan limits: DataSources count.
      if (dataSources.length >= owner.plan.limits.dataSources.count) {
        return apiError(req, res, {
          status_code:402, 
          api_error: {
            type: "plan_limit_exceeded",
            message: "You have reached the limit of data sources for your plan.",
          },
        })
      }

      const dustProject = await DustAPI.createProject();
      if (dustProject.isErr()) {
        res.status(500).end();
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
          dataSourceId: dataSourceName,
          config: {
            provider_id: dataSourceProdiverId,
            model_id: dataSourceModelId,
            splitter_id: "base_v0",
            max_chunk_size: dataSourceMaxChunkSize,
            use_cache: false,
          },
          credentials,
        }
      );

      if (dustDataSource.isErr()) {
        res.status(500).end();
        return;
      }

      const dataSource = await DataSource.create({
        name: dataSourceName,
        description: dataSoruceDescription,
        //assuming managed data sources are always private for now
        visibility: "private",
        config: JSON.stringify(dustDataSource.value.data_source.config),
        dustAPIProjectId: dustProject.value.project.project_id.toString(),
        workspaceId: owner.id,
      });
      const systemAPIKeyRes = await getSystemApiKey(owner.id);
      if (systemAPIKeyRes.isErr()) {
        console.error(
          "Could not create the system API key",
          systemAPIKeyRes.error
        );
        res.status(500).end();
        return;
      }
      const dataSourceConfig: DataSourceConfig = {
        APIKey: systemAPIKeyRes.value.secret,
        workspaceId: owner.id.toString(),
        dataSourceName: dataSource.name,
      };
      const connectorRes = await createSlackConnector(
        dataSourceConfig,
        req.body.nangoConnectionId
      );
      if (connectorRes.isErr()) {
        res.status(500).end();
        console.error("Could not create the connector", connectorRes.error);
        return;
      }
      dataSource.connectorId = connectorRes.value;
      dataSource.connectorProvider = "slack";

      res.redirect(`/${owner.sId}/ds/${dataSource.name}`);
      return;

    default:
      res.status(405).end();
      return;
  }
}

export async function getSystemApiKey(
  workspaceId: number
): Promise<Result<Key, Error>> {
  let key = await Key.findOne({
    where: {
      workspaceId,
      isSystem: true,
    },
  });
  if (!key) {
    let secret = `sk-${new_id().slice(0, 32)}`;
    key = await Key.create({
      workspaceId,
      isSystem: true,
      secret: secret,
      status: "active",
    });
  }
  if (!key) {
    return new Err(new Error("Failed to create system key"));
  }

  return new Ok(key);
}

export default withLogging(handler);
