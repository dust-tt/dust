import withLogging from "@app/logger/withlogging";
import { APIError } from "@app/lib/error";
import { DataSource, Provider, User, Connector, Key } from "@app/lib/models";
import { DataSourceType } from "@app/types/data_source";
import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";
import { parse_payload } from "@app/lib/http_utils";
import { Nango } from "@nangohq/node";
import {
  triggerSlackSync,
  getTeamInfo,
  syncOneThread,
} from "dust-connectors/compiled/slack/client";

const { NANGO_SECRET_KEY, NANGO_SLACK_CONNECTOR_ID } = process.env;

export type GetDataSourcesResponseBody = {
  dataSources: Array<DataSourceType>;
};

type SlackWebhookQuery = {
  team_id: string;
  event: {
    channel: string;
    ts: string; // slack message id
    thread_ts: string; // slack thread id
    type: string; // event name (eg: "message" for a newly posted message)
  };
};

const slackWebhookQuerySchema: JSONSchemaType<SlackWebhookQuery> = {
  type: "object",
  properties: {
    team_id: {
      type: "string",
    },
    event: {
      type: "object",
      properties: {
        type: {
          type: "string",
        },
        channel: {
          type: "string",
        },
        ts: {
          type: "string",
        },
        thread_ts: {
          type: "string",
        },
      },
      required: ["channel", "ts", "thread_ts"],
    },
  },
  required: ["team_id", "event"],
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<APIError>
): Promise<void> {
  switch (req.method) {
    case "POST": {
      const searchQueryRes = parse_payload(slackWebhookQuerySchema, req.body);
      if (searchQueryRes.isErr()) {
        res.status(401).send({
          error: {
            type: "invalid_request_error",
            message: searchQueryRes.error.message,
          },
        });
        return;
      }
      const webhookQuery = searchQueryRes.value;
      if (webhookQuery.event.type === "message") {
        const connector = await Connector.findOne({
          where: {
            slackTeamId: webhookQuery.team_id,
          },
        });
        if (!connector) {
          res.status(404).send({
            error: {
              type: "connector_error",
              message: `Connector not found for team_id ${webhookQuery.team_id}`,
            },
          });
          return;
        }
        const dataSource = await DataSource.findByPk(connector.dataSourceId);
        if (!dataSource) {
          res.status(404).send({
            error: {
              type: "connector_error",
              message: `DataSource not found for team_id ${webhookQuery.team_id}`,
            },
          });
          return;
        }
        const nango = new Nango({ secretKey: NANGO_SECRET_KEY });
        const slackAccessToken = await nango.getToken(
          NANGO_SLACK_CONNECTOR_ID!,
          connector.nangoConnectionId
        );
        let systemKey = await Key.findOne({
          where: {
            userId: connector.userId,
            isSystem: true,
          },
          // transaction:t
        });
        if (!systemKey) {
          res.status(500).json({
            error: {
              type: "internal_server_error",
              message: "System key not found",
            },
          });
          return;
        }
        const dataSourceUser = await User.findOne({
          where: {
            id: connector.userId,
          },
        });
        if (!dataSourceUser) {
          res.status(500).json({
            error: {
              type: "internal_server_error",
              message: "User not found",
            },
          });
          return;
        }
        if (webhookQuery.event.thread_ts) {
          // not sure that we want to await here. TBD
          await syncOneThread(
            { accessToken: slackAccessToken },
            {
              username: dataSourceUser.username,
              datasourceId: dataSource.name,
              APIKey: systemKey.secret,
            },
            webhookQuery.event.channel,
            webhookQuery.event.thread_ts
          );
        }
      }

      res.status(200).end();

      return;
    }
    default:
      res.status(405).end();
      return;
  }
}

export default withLogging(handler);
