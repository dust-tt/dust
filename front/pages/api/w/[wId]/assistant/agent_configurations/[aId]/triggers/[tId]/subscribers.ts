import type { NextApiRequest, NextApiResponse } from "next";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { UserType } from "@app/types/user";

export interface GetSubscribersResponseBody {
  subscribers: UserType[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetSubscribersResponseBody | void>>,
  auth: Authenticator
): Promise<void> {
  const { aId, tId } = req.query;

  if (!isString(aId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID.",
      },
    });
  }

  if (!isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
      },
    });
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: aId,
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

  const trigger = await TriggerResource.fetchById(auth, tId);
  if (!trigger) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "The trigger was not found.",
      },
    });
  }

  // Verify the trigger belongs to the specified agent configuration
  if (trigger.agentConfigurationId !== aId) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "The trigger was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const subscribersResult = await trigger.getSubscribers(auth);
      if (subscribersResult.isErr()) {
        return apiError(req, res, {
          status_code:
            subscribersResult.error.code === "unauthorized" ? 403 : 500,
          api_error: {
            type:
              subscribersResult.error.code === "unauthorized"
                ? "app_auth_error"
                : "internal_server_error",
            message: subscribersResult.error.message,
          },
        });
      }

      const subscribers = subscribersResult.value.map((user: UserResource) =>
        user.toJSON()
      );

      return res.status(200).json({
        subscribers,
      });
    }

    case "POST": {
      const addResult = await trigger.addToSubscribers(auth);
      if (addResult.isErr()) {
        const statusCode =
          addResult.error.code === "unauthorized"
            ? 403
            : addResult.error.code === "internal_error" &&
                addResult.error.message.includes("editor")
              ? 400
              : 500;
        return apiError(req, res, {
          status_code: statusCode,
          api_error: {
            type:
              addResult.error.code === "unauthorized"
                ? "app_auth_error"
                : statusCode === 400
                  ? "invalid_request_error"
                  : "internal_server_error",
            message: addResult.error.message,
          },
        });
      }

      res.status(201).end();
      return;
    }

    case "DELETE": {
      const removeResult = await trigger.removeFromSubscribers(auth);
      if (removeResult.isErr()) {
        return apiError(req, res, {
          status_code: removeResult.error.code === "unauthorized" ? 403 : 500,
          api_error: {
            type:
              removeResult.error.code === "unauthorized"
                ? "app_auth_error"
                : "internal_server_error",
            message: removeResult.error.message,
          },
        });
      }

      res.status(204).end();
      return;
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, POST or DELETE is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
