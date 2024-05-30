import type { WithAPIErrorReponse } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { ScheduledAgentResource } from "@app/lib/resources/scheduled_agent_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { PostScheduledAgentResponseBody } from "@app/pages/api/w/[wId]/scheduled_agents";
import { ScheduledAssistantPostOrPatchBodySchema } from "@app/pages/api/w/[wId]/scheduled_agents";
import {
  launchScheduleAgentWorkflow,
  terminateScheduleAgentWorkflow,
} from "@app/temporal/scheduled_agents/client";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorReponse<PostScheduledAgentResponseBody>>
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  const user = auth.user();

  if (!owner || !user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Workspace not found.",
      },
    });
  }

  if (!auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "app_auth_error",
        message:
          "Only the users that are `builders` for the current workspace can disable a key.",
      },
    });
  }

  if (!owner.flags.includes("scheduler")) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "invalid_request_error",
        message: "Not found.",
      },
    });
  }

  const { sId } = req.query;

  if (typeof sId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid scheduled agent sId",
      },
    });
  }

  const scheduledAgent = await ScheduledAgentResource.getBySid(sId);

  if (!scheduledAgent) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "scheduled_agent_not_found",
        message: "Could not find the scheduled agent.",
      },
    });
  }

  switch (req.method) {
    case "PATCH":
      const bodyValidation = ScheduledAssistantPostOrPatchBodySchema.decode(
        req.body
      );
      if (isLeft(bodyValidation)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid request body",
          },
        });
      }

      const updatedScheduledAgent = await scheduledAgent.overwrite({
        ...bodyValidation.right,
      });

      await terminateScheduleAgentWorkflow({
        scheduledAgentId: updatedScheduledAgent.sId,
      });
      await launchScheduleAgentWorkflow({
        scheduledAgentId: updatedScheduledAgent.sId,
      });

      res.status(200).json({
        scheduledAgent: updatedScheduledAgent.toJSON(),
      });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, PATCH is expected.",
        },
      });
  }
}

export default withLogging(handler);
