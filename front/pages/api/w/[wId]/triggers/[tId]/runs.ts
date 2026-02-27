import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { TriggerRunResource } from "@app/lib/resources/trigger_run_resource";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { TriggerRunType } from "@app/types/assistant/triggers";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";
import { Op } from "sequelize";

export interface GetTriggerRunsResponseBody {
  runs: TriggerRunType[];
  totalCount: number;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTriggerRunsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { tId } = req.query;

  if (!isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
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

  switch (req.method) {
    case "GET": {
      const { limit: limitStr, offset: offsetStr } = req.query;
      const limit = isString(limitStr) ? parseInt(limitStr, 10) : 20;
      const offset = isString(offsetStr) ? parseInt(offsetStr, 10) : 0;

      const { runs, totalCount } = await TriggerRunResource.listByTriggerId(
        auth,
        trigger.id,
        { limit, offset }
      );

      // Enrich runs with conversationSId by looking up ConversationModel.
      const conversationIds = [
        ...new Set(
          runs
            .map((run) => run.conversationId)
            .filter((id): id is number => id !== null)
        ),
      ];

      const conversationSIdMap = new Map<number, string>();
      if (conversationIds.length > 0) {
        const conversations = await ConversationModel.findAll({
          where: {
            id: { [Op.in]: conversationIds },
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          attributes: ["id", "sId"],
        });
        for (const conv of conversations) {
          conversationSIdMap.set(conv.id, conv.sId);
        }
      }

      return res.status(200).json({
        runs: runs.map((run) => ({
          ...run.toJSON(),
          conversationSId: run.conversationId
            ? (conversationSIdMap.get(run.conversationId) ?? null)
            : null,
        })),
        totalCount,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
