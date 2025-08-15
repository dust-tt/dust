import { isLeft } from "fp-ts/lib/Either";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type {
  TriggerConfigType,
  TriggerType,
} from "@app/types/assistant/triggers";
import { TriggerSchema } from "@app/types/assistant/triggers";

export interface GetTriggerResponseBody {
  trigger: TriggerType;
}

export interface PatchTriggerResponseBody {
  trigger: TriggerType;
}

export interface DeleteTriggerResponseBody {
  success: boolean;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      | GetTriggerResponseBody
      | PatchTriggerResponseBody
      | DeleteTriggerResponseBody
    >
  >,
  auth: Authenticator
): Promise<void> {
  const { aId, triggerId } = req.query;
  const agentConfigurationId = aId as string;
  const triggerSId = triggerId as string;

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

  const trigger = await TriggerResource.fetchById(auth, triggerSId);
  if (!trigger) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "The trigger was not found.",
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

  if (trigger.agentConfigurationId !== agentConfigurationModelId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "The trigger was not found for this agent.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      return res.status(200).json({
        trigger: trigger.toSimpleJSON(),
      });
    }

    case "PATCH": {
      if (!agentConfiguration.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can modify triggers for this agent.",
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

      const updateResult = await TriggerResource.update(auth, triggerSId, {
        name: triggerData.name,
        description: triggerData.description,
        kind: triggerData.kind,
        configuration: triggerData.config || null,
      });

      if (updateResult.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: updateResult.error.message,
          },
        });
      }

      const updatedTrigger = updateResult.value;
      return res.status(200).json({
        trigger: updatedTrigger.toSimpleJSON(),
      });
    }

    case "DELETE": {
      if (!agentConfiguration.canEdit && !auth.isAdmin()) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "app_auth_error",
            message: "Only editors can delete triggers for this agent.",
          },
        });
      }

      const deleteResult = await trigger.delete(auth);
      if (deleteResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete trigger.",
          },
        });
      }

      return res.status(200).json({ success: true });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
