import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { unsafeGetUsageData } from "@app/lib/workspace_usage";
import { apiError, withLogging } from "@app/logger/withlogging";

const DateString = t.refinement(
  t.string,
  (s): s is string => /^\d{4}-\d{2}-\d{2}$/.test(s),
  "YYYY-MM-DD"
);

const GetWorkspaceUsageSchema = t.intersection([
  t.type({
    start_date: DateString,
  }),
  t.partial({
    end_date: t.union([DateString, t.undefined, t.null]),
  }),
]);

/**
 * @swagger
 * /api/v1/w/{wId}/usage:
 *   get:
 *     summary: Get workspace usage data (deprecated)
 *     description: Get usage data for the workspace identified by {wId} in CSV format. Note: this endpoint is deprecated in favour of `/api/v1/w/{wId}/workspace-usage
 *     tags:
 *       - Workspace
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Unique string identifier for the workspace
 *         schema:
 *           type: string
 *       - in: query
 *         name: start_date
 *         required: true
 *         description: The start date in YYYY-MM-DD format
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: end_date
 *         required: false
 *         description: The end date in YYYY-MM-DD format
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: The usage data in CSV format
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *             example: |
 *               createdAt,conversationInternalId,messageId,parentMessageId,messageType,userFullName,userEmail,assistantId,assistantName,actionType,source
 *               YYYY-MM-DD HH:MM:SS,<conversation_id>,<message_id>,<parent_message_id>,<message_type>,<user_full_name>,<user_email>,<assistant_id>,<assistant_name>,<action_type>,<source>
 *               YYYY-MM-DD HH:MM:SS,<conversation_id>,<message_id>,<parent_message_id>,<message_type>,<user_full_name>,<user_email>,<assistant_id>,<assistant_name>,<action_type>,<source>
 *       404:
 *         description: The workspace was not found
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }
  const { auth } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner || !auth.isBuilder()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!owner.flags.includes("usage_data_api")) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "The workspace does not have access to the usage data API.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation = GetWorkspaceUsageSchema.decode(req.query);
      if (isLeft(queryValidation)) {
        const pathError = reporter.formatValidationErrors(queryValidation.left);
        return apiError(req, res, {
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request query: ${pathError}`,
          },
          status_code: 400,
        });
      }

      const query = queryValidation.right;

      const csvData = await unsafeGetUsageData(
        new Date(query.start_date),
        query.end_date ? new Date(query.end_date) : new Date(),
        owner.sId
      );
      res.setHeader("Content-Type", "text/csv");
      res.status(200).send(csvData);
      return;

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

export default withLogging(handler);
