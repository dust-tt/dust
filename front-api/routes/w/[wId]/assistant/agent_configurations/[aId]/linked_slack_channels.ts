import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import config from "@app/lib/api/config";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { apiError } from "@front-api/middleware/utils";
import { validate } from "@front-api/middleware/validator";
import { Hono } from "hono";
import { z } from "zod";

const PatchLinkedSlackChannelsRequestBodySchema = z.object({
  slack_channel_internal_ids: z.array(z.string()),
  provider: z.enum(["slack", "slack_bot"]),
  auto_respond_without_mention: z.boolean().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/linked_slack_channels.
const app = new Hono();

app.patch(
  "/",
  validate("json", PatchLinkedSlackChannelsRequestBodySchema),
  async (c) => {
    const auth = c.get("auth");
    const aId = c.req.param("aId") ?? "";
    const body = c.req.valid("json");

    if (!auth.isBuilder()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message:
            "Only the users that are `builders` for the current workspace can access an agent.",
        },
      });
    }

    if (body.auto_respond_without_mention) {
      const featureFlags = await getFeatureFlags(auth);
      if (!featureFlags.includes("slack_enhanced_default_agent")) {
        return apiError(c, {
          status_code: 403,
          api_error: {
            type: "feature_flag_not_found",
            message:
              "The auto respond without mention feature is not enabled for this workspace.",
          },
        });
      }
    }

    const [slackDataSource] = await DataSourceResource.listByConnectorProvider(
      auth,
      body.provider,
      { limit: 1 }
    );

    if (!slackDataSource) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "data_source_not_found",
          message: "The Slack data source was not found.",
        },
      });
    }

    const { connectorId } = slackDataSource;
    if (!connectorId) {
      throw new Error("Unreachable code: connectorId is null.");
    }

    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: aId,
      variant: "light",
    });
    if (!agentConfiguration) {
      return apiError(c, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message:
            "The agent configuration you're trying to modify was not found.",
        },
      });
    }

    if (!agentConfiguration.canEdit && !auth.isAdmin()) {
      return apiError(c, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify agents.",
        },
      });
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const connectorsApiRes = await connectorsAPI.linkSlackChannelsWithAgent({
      connectorId: connectorId.toString(),
      agentConfigurationId: agentConfiguration.sId,
      slackChannelInternalIds: body.slack_channel_internal_ids,
      autoRespondWithoutMention: body.auto_respond_without_mention,
    });

    if (connectorsApiRes.isErr()) {
      if (connectorsApiRes.error.type === "connector_operation_in_progress") {
        logger.info(
          connectorsApiRes.error,
          "Slack channel linking already in progress."
        );
        return apiError(c, {
          status_code: 409,
          api_error: {
            type: "connector_operation_in_progress",
            message: connectorsApiRes.error.message,
          },
        });
      }

      logger.error(
        connectorsApiRes.error,
        "An error occurred while linking Slack channels."
      );
      return apiError(c, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "An error occurred while linking Slack channels.",
        },
      });
    }

    return c.json({ success: true });
  }
);

export default app;
