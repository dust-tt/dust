import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { ConnectorsAPI } from "@app/types";

export type PatchLinkedSlackChannelsResponseBody = {
  success: true;
};

export const PatchLinkedSlackChannelsRequestBodySchema = t.type({
  slack_channel_internal_ids: t.array(t.string),
  provider: t.union([t.literal("slack"), t.literal("slack_bot")]),
  auto_respond_without_mention: t.union([t.boolean, t.undefined]),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PatchLinkedSlackChannelsResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can access an agent.",
      },
    });
  }

  const bodyValidationResult = PatchLinkedSlackChannelsRequestBodySchema.decode(
    req.body
  );
  if (
    bodyValidationResult._tag === "Right" &&
    bodyValidationResult.right.auto_respond_without_mention
  ) {
    const owner = auth.getNonNullableWorkspace();
    const featureFlags = await getFeatureFlags(owner);
    if (!featureFlags.includes("slack_enhanced_default_agent")) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "feature_flag_not_found",
          message:
            "The auto respond without mention feature is not enabled for this workspace.",
        },
      });
    }
  }

  if (req.method !== "PATCH") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, PATCH is expected.",
      },
    });
  }

  const bodyValidation = PatchLinkedSlackChannelsRequestBodySchema.decode(
    req.body
  );
  if (isLeft(bodyValidation)) {
    const pathError = reporter.formatValidationErrors(bodyValidation.left);
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid request body: ${pathError}`,
      },
    });
  }

  const [slackDataSource] = await DataSourceResource.listByConnectorProvider(
    auth,
    bodyValidation.right.provider,
    { limit: 1 }
  );

  if (!slackDataSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "data_source_not_found",
        message: "The Slack data source was not found.",
      },
    });
  }

  const connectorId = slackDataSource.connectorId;

  if (!connectorId) {
    throw new Error("Unreachable code: connectorId is null.");
  }

  const agentConfigurationSid = req.query.aId as string;
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationSid,
    variant: "light",
  });
  if (!agentConfiguration) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message:
          "The agent configuration you're trying to modify was not found.",
      },
    });
  }

  if (!agentConfiguration.canEdit && !auth.isAdmin()) {
    return apiError(req, res, {
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
    slackChannelInternalIds: bodyValidation.right.slack_channel_internal_ids,
    autoRespondWithoutMention:
      bodyValidation.right.auto_respond_without_mention,
  });

  if (connectorsApiRes.isErr()) {
    // Check if the error is specifically about operation already in progress
    if (connectorsApiRes.error.type === "connector_operation_in_progress") {
      logger.info(
        connectorsApiRes.error,
        "Slack channel linking already in progress."
      );
      return apiError(req, res, {
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
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "An error occurred while linking Slack channels.",
      },
    });
  }

  return res.status(200).json({
    success: true,
  });
}

export default withSessionAuthenticationForWorkspace(handler);
