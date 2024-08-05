import { assertNever } from "@dust-tt/types";
import { endOfMonth } from "date-fns/endOfMonth";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import JSZip from "jszip";
import type { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import {
  getAssistantsUsageData,
  getBuildersUsageData,
  getMessageUsageData,
  getUserUsageData,
} from "@app/lib/workspace_usage";
import { apiError, withLogging } from "@app/logger/withlogging";
import { getSupportedUsageTablesCodec } from "@app/pages/api/w/[wId]/workspace-usage";

export const usageTables = [
  "users",
  "assistant_messages",
  "builders",
  "assistants",
  "all",
];
type usageTableType = (typeof usageTables)[number];

const DateString = t.refinement(
  t.string,
  (s): s is string => /^\d{4}-\d{2}-\d{2}$/.test(s),
  "YYYY-MM-DD"
);

const GetWorkspaceUsageSchema = t.union([
  t.type({
    start: DateString,
    end: t.undefined,
    mode: t.literal("month"),
    table: getSupportedUsageTablesCodec(),
  }),
  t.type({
    start: DateString,
    end: DateString,
    mode: t.literal("range"),
    table: getSupportedUsageTablesCodec(),
  }),
]);

/**
 * @swagger
 * /api/v1/w/{wId}/workspace-usage:
 *   get:
 *     summary: Get workspace usage data
 *     description: Get usage data for the workspace identified by {wId} in CSV format.
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
      const { endDate, startDate } = resolveDates(query);
      const csvData = await fetchUsageData({
        table: query.table,
        start: startDate,
        end: endDate,
        workspaceId: owner.sId,
      });
      const zip = new JSZip();
      const csvSuffix = startDate
        .toLocaleString("default", { month: "short" })
        .toLowerCase();
      for (const [fileName, data] of Object.entries(csvData)) {
        if (data) {
          zip.file(
            `${fileName}_${startDate.getFullYear()}_${csvSuffix}.csv`,
            data
          );
        }
      }

      const zipContent = await zip.generateAsync({ type: "nodebuffer" });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="usage.zip"`);
      res.status(200).send(zipContent);
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

function resolveDates(query: t.TypeOf<typeof GetWorkspaceUsageSchema>) {
  switch (query.mode) {
    case "month":
      const date = new Date(`${query.start}-01`);
      return { startDate: date, endDate: endOfMonth(date) };
    case "range":
      return {
        startDate: new Date(`${query.start}-01`),
        endDate: endOfMonth(new Date(`${query.end}-01`)),
      };
    default:
      assertNever(query);
  }
}

async function fetchUsageData({
  table,
  start,
  end,
  workspaceId,
}: {
  table: usageTableType;
  start: Date;
  end: Date;
  workspaceId: string;
}): Promise<Partial<Record<usageTableType, string>>> {
  switch (table) {
    case "users":
      return { users: await getUserUsageData(start, end, workspaceId) };
    case "assistant_messages":
      return { mentions: await getMessageUsageData(start, end, workspaceId) };
    case "builders":
      return { builders: await getBuildersUsageData(start, end, workspaceId) };
    case "assistants":
      return {
        assistants: await getAssistantsUsageData(start, end, workspaceId),
      };
    case "all":
      const [users, assistant_messages, builders, assistants] =
        await Promise.all([
          getUserUsageData(start, end, workspaceId),
          getMessageUsageData(start, end, workspaceId),
          getBuildersUsageData(start, end, workspaceId),
          getAssistantsUsageData(start, end, workspaceId),
        ]);
      return { users, assistant_messages, builders, assistants };
    default:
      return {};
  }
}

export default withLogging(handler);
