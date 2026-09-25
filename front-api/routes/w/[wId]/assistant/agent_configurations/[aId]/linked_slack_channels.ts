import config from "@app/lib/api/config";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { ConnectorsAPI } from "@app/types/connectors/connectors_api";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { workspaceApp } from "@front-api/middlewares/ctx";
import { ensureHasWorkspacePermission } from "@front-api/middlewares/ensure_role";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import type { SuccessResponseBody } from "@front-api/routes/types";
import {
  ARCHIVED_AGENT_API_ERROR,
  isArchivedAgent,
} from "@front-api/routes/w/[wId]/assistant/agent_configurations/guards";
import { z } from "zod";

const ParamsSchema = z.object({
  aId: z.string(),
});

const PatchLinkedSlackChannelsRequestBodySchema = z.object({
  slack_channel_internal_ids: z.array(z.string()),
  provider: z.enum(["slack", "slack_bot"]),
  auto_respond_without_mention: z.boolean().optional(),
  auto_respond_without_mention_skip_thread_replies: z.boolean().optional(),
});

// Mounted at /api/w/:wId/assistant/agent_configurations/:aId/linked_slack_channels.
const app = workspaceApp();

/** @ignoreswagger */
app.patch(
  "/",
  validate("param", ParamsSchema),
  validate("json", PatchLinkedSlackChannelsRequestBodySchema),
  ensureHasWorkspacePermission(
    "publish",
    "agent",
    "Only users who can publish agents can perform this action."
  ),
  async (ctx): HandlerResult<SuccessResponseBody> => {
    const auth = ctx.get("auth");
    const { aId } = ctx.req.valid("param");
    const body = ctx.req.valid("json");

    const [slackDataSource] = await DataSourceResource.listByConnectorProvider(
      auth,
      body.provider,
      { limit: 1 }
    );

    if (!slackDataSource) {
      return apiError(ctx, {
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

    const agent = await AgentResource.fetchById(auth, aId);
    if (!agent) {
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "agent_configuration_not_found",
          message:
            "The agent configuration you're trying to modify was not found.",
        },
      });
    }

    if (!auth.can("write", agent)) {
      return apiError(ctx, {
        status_code: 403,
        api_error: {
          type: "app_auth_error",
          message: "Only editors can modify agents.",
        },
      });
    }

    if (isArchivedAgent(agent)) {
      return apiError(ctx, ARCHIVED_AGENT_API_ERROR);
    }

    const connectorsAPI = new ConnectorsAPI(
      config.getConnectorsAPIConfig(),
      logger
    );

    const connectorsApiRes = await connectorsAPI.linkSlackChannelsWithAgent({
      connectorId: connectorId.toString(),
      agentConfigurationId: agent.sId,
      slackChannelInternalIds: body.slack_channel_internal_ids,
      autoRespondWithoutMention: body.auto_respond_without_mention,
      autoRespondWithoutMentionSkipThreadReplies:
        body.auto_respond_without_mention_skip_thread_replies,
    });

    if (connectorsApiRes.isErr()) {
      if (connectorsApiRes.error.type === "connector_operation_in_progress") {
        return apiError(
          ctx,
          {
            status_code: 409,
            api_error: {
              type: "connector_operation_in_progress",
              message: connectorsApiRes.error.message,
            },
          },
          normalizeError(connectorsApiRes.error)
        );
      }

      return apiError(
        ctx,
        {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "An error occurred while linking Slack channels.",
          },
        },
        normalizeError(connectorsApiRes.error)
      );
    }

    return ctx.json({ success: true });
  }
);

export default app;
