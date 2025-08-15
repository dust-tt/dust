import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { generateRandomModelSId, getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  TriggerConfigType,
  TriggerType,
} from "@app/types/assistant/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";

export interface GetTriggersResponseBody {
  triggers: TriggerType[];
}

export interface PostTriggerResponseBody {
  trigger: TriggerType;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetTriggersResponseBody | PostTriggerResponseBody>
  >,
  auth: Authenticator
): Promise<void> {
  const agentConfigurationId = req.query.aId as string;

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentConfigurationId,
    variant: "light",
  });

  if (!agentConfiguration || !agentConfiguration.canRead) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  const agentConfigurationModelId = getResourceIdFromSId(
    agentConfiguration.sId
  );
  if (!agentConfigurationModelId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "agent_configuration_not_found",
        message: "The agent configuration was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const triggers = await TriggerResource.listByAgentConfigurationId(
        auth,
        agentConfigurationModelId
      );

      return res.status(200).json({
        triggers: triggers.map((trigger) => trigger.toSimpleJSON()),
      });
    }

    case "POST": {
      if (!agentConfiguration.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can create triggers for this agent.",
          },
        });
      }

      const bodyValidation = TriggerSchema.decode(req.body);
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

      const triggerData = bodyValidation.right;
      const workspace = auth.getNonNullableWorkspace();

      try {
        const sId = generateRandomModelSId();
        const trigger = await TriggerResource.makeNew({
          sId,
          workspaceId: workspace.id,
          agentConfigurationId: agentConfigurationModelId,
          name: triggerData.name,
          description: triggerData.description,
          kind: triggerData.kind,
          configuration: triggerData.config || null,
        });

        return res.status(201).json({
          trigger: trigger.toSimpleJSON(),
        });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to create trigger.",
          },
        });
      }
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
