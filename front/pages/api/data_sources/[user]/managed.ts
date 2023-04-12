import { Role, auth_user } from "@app/lib/auth";
import { new_id } from "@app/lib/utils";
import { DustAPI } from "@app/lib/dust_api";
import { DataSource, Provider, User, Connector, Key } from "@app/lib/models";
import { credentialsFromProviders } from "@app/lib/providers";
import withLogging from "@app/logger/withlogging";
import { DataSourceType } from "@app/types/data_source";
import { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";
import { triggerSlackSync } from "@app/connectors/src/client";
import { Nango } from "@nangohq/node";

const { NANGO_SECRET_KEY, NANGO_SLACK_CONNECTOR_ID } = process.env;

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<GetDataSourcesResponseBody>
): Promise<void> {
  const [authRes, dataSourceUser] = await Promise.all([
    auth_user(req, res),
    User.findOne({
      where: {
        username: req.query.user,
      },
    }),
  ]);

  if (authRes.isErr()) {
    res.status(authRes.error.status_code).end();
    return;
  }
  const auth = authRes.value;

  if (!dataSourceUser) {
    res.status(404).end();
    return;
  }

  const dataSourceUserId = dataSourceUser.id;

  const role = await auth.roleFor(dataSourceUser);

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
  const dataSources = await DataSource.findAll({
    where,
    order: [["updatedAt", "DESC"]],
  });

  switch (req.method) {
    case "POST": {
      if (role !== Role.Owner) {
        res.status(401).end();
        return;
      }
      const providerId = "openai";
      const maxChunkSize = 1024;
      const dataSourceId = `Slack-Managed`;
      const description = "Slack data source managed by Dust";
      const modelId = "text-embedding-ada-002";

      if (!req.body || !(typeof req.body.nango_connection_id == "string")) {
        res.status(400).end();
        return;
      }

      let nangoConnectionId = req.body.nango_connection_id as string;

      // Enforce FreePlan limit: 1 DataSource.
      if (dataSources.length >= 1 && auth.user().username !== "spolu") {
        res.status(400).end();
        return;
      }

      const dustProject = await DustAPI.createProject();
      console.log("Created project: ", dustProject);
      if (dustProject.isErr()) {
        res.status(500).end();
        return;
      }

      // The OpenAI credentials will be managed by Dust too.
      let [providers] = await Promise.all([
        Provider.findAll({
          where: {
            userId: auth.user().id,
          },
        }),
      ]);
      let credentials = credentialsFromProviders(providers);

      const dustDataSource = await DustAPI.createDataSource(
        dustProject.value.project.project_id.toString(),
        {
          dataSourceId: dataSourceId,
          config: {
            provider_id: providerId,
            model_id: modelId,
            splitter_id: "base_v0",
            max_chunk_size: maxChunkSize,
            use_cache: false,
          },
          credentials,
        }
      );
      console.log("Created data source: ", dustDataSource);

      if (dustDataSource.isErr()) {
        res.status(500).end();
        return;
      }

      const createdDataSource = await DataSource.create(
        {
          name: dataSourceId,
          description: description,
          visibility: "private",
          config: JSON.stringify(dustDataSource.value.data_source.config),
          dustAPIProjectId: dustProject.value.project.project_id.toString(),
          userId: dataSourceUserId,
        }
      );

      await Connector.create(
        {
          type: "slack",
          nangoConnectionId: nangoConnectionId,
          dataSourceId: createdDataSource.id,
          userId: auth.user().id,
        }
      );

      let systemKey = await Key.findOne({
        where: {
          userId: auth.user().id,
          isSystem: true,
        },
        // transaction:t
      });
      if (!systemKey) {
        const secret = `sk-${new_id().slice(0, 32)}`;

        systemKey = await Key.create(
          {
            userId: createdDataSource.userId,
            secret: secret,
            isSystem: true,
            status: "active",
          }
        );
      }

      let nango = new Nango({ secretKey: NANGO_SECRET_KEY });
      let accessToken = await nango.getToken(
        NANGO_SLACK_CONNECTOR_ID!,
        nangoConnectionId
      );
      triggerSlackSync(
        { accessToken: accessToken },
        {
          username: dataSourceUser.username,
          datasourceId: createdDataSource.name,
          APIKey: systemKey.secret,
        }
      );

      // Would be cool to be able to enqueue the first Slack sync task here
      res.redirect(`/${dataSourceUser.username}/ds/${req.body.name}`);
      return;
    }
    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
