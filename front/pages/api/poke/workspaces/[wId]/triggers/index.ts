import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";

export type PokeListTriggers = {
  triggers: TriggerType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListTriggers>>,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);

  const owner = auth.workspace();
  if (!owner || !auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "Could not find triggers.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const triggers = await TriggerResource.listByWorkspace(auth);

      return res.status(200).json({
        triggers: triggers.map((t) => t.toJSON()),
      });

    case "DELETE":
      const { tId } = req.query;
      if (typeof tId !== "string") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "The trigger ID is required.",
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

      res.status(204).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method is not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
