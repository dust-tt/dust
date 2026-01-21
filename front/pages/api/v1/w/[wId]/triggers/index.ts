import type { GetTriggersResponseType } from "@dust-tt/client";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import { toPublicTriggers } from "@app/lib/api/public_api/triggers";
import type { Authenticator } from "@app/lib/auth";
import { isString } from "@app/lib/utils";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import type { TriggerKind, TriggerStatus } from "@app/types/assistant/triggers";

const VALID_TRIGGER_KINDS: TriggerKind[] = ["schedule", "webhook"];
const VALID_TRIGGER_STATUSES: TriggerStatus[] = [
  "enabled",
  "disabled",
  "relocating",
  "downgraded",
];

/**
 * @swagger
 * /api/v1/w/{wId}/triggers:
 *   get:
 *     summary: List all triggers in workspace
 *     description: Get all triggers in the workspace identified by {wId}.
 *     tags:
 *       - Triggers
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: ID of the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: kind
 *         required: false
 *         description: Filter by trigger kind
 *         schema:
 *           type: string
 *           enum: [schedule, webhook]
 *       - in: query
 *         name: status
 *         required: false
 *         description: Filter by trigger status
 *         schema:
 *           type: string
 *           enum: [enabled, disabled, relocating, downgraded]
 *       - in: query
 *         name: agentConfigurationSId
 *         required: false
 *         description: Filter by agent configuration ID
 *         schema:
 *           type: string
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of triggers in the workspace
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 triggers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       agentConfigurationSId:
 *                         type: string
 *                       kind:
 *                         type: string
 *                         enum: [schedule, webhook]
 *                       status:
 *                         type: string
 *                         enum: [enabled, disabled, relocating, downgraded]
 *                       configuration:
 *                         type: object
 *                       createdAt:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       405:
 *         description: Method not supported
 */
async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTriggersResponseType>>,
  auth: Authenticator
): Promise<void> {
  const { kind, status, agentConfigurationSId } = req.query;

  // Validate query parameters
  if (isString(kind) && !VALID_TRIGGER_KINDS.includes(kind as TriggerKind)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid kind parameter. Must be one of: ${VALID_TRIGGER_KINDS.join(", ")}`,
      },
    });
  }

  if (
    isString(status) &&
    !VALID_TRIGGER_STATUSES.includes(status as TriggerStatus)
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: `Invalid status parameter. Must be one of: ${VALID_TRIGGER_STATUSES.join(", ")}`,
      },
    });
  }

  switch (req.method) {
    case "GET": {
      // Fetch all triggers in workspace
      let triggers = await TriggerResource.listByWorkspace(auth);

      // Apply filters
      if (isString(kind)) {
        triggers = triggers.filter((t) => t.kind === kind);
      }

      if (isString(status)) {
        triggers = triggers.filter((t) => t.status === status);
      }

      if (isString(agentConfigurationSId)) {
        triggers = triggers.filter(
          (t) => t.agentConfigurationId === agentConfigurationSId
        );
      }

      const publicTriggers = await toPublicTriggers(auth, triggers);

      return res.status(200).json({
        triggers: publicTriggers,
      });
    }
    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, only GET is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler);
