import type {
  GetWorkspaceUsageRequestType,
  GetWorkspaceUsageResponseType,
  UsageTableType,
} from "@dust-tt/client";
import { GetWorkspaceUsageRequestSchema } from "@dust-tt/client";
import { parse as parseCSV } from "csv-parse/sync";
import { endOfMonth } from "date-fns/endOfMonth";
import JSZip from "jszip";
import type { NextApiRequest, NextApiResponse } from "next";
import { fromError } from "zod-validation-error";

import { withPublicAPIAuthentication } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  getAssistantsUsageData,
  getBuildersUsageData,
  getFeedbackUsageData,
  getMessageUsageData,
  getUserUsageData,
} from "@app/lib/workspace_usage";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse, WorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/workspace-usage:
 *   get:
 *     summary: Get workspace usage data
 *     description: Get usage data for the workspace identified by {wId} in CSV or JSON format.
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
 *         name: start
 *         required: true
 *         description: The start date in YYYY-MM or YYYY-MM-DD format
 *         schema:
 *           type: string
 *       - in: query
 *         name: end
 *         required: false
 *         description: The end date in YYYY-MM or YYYY-MM-DD format (required when mode is 'range')
 *         schema:
 *           type: string
 *       - in: query
 *         name: mode
 *         required: true
 *         description: The mode of date range selection
 *         schema:
 *           type: string
 *           enum: [month, range]
 *       - in: query
 *         name: format
 *         required: false
 *         description: The output format of the data (defaults to 'csv')
 *         schema:
 *           type: string
 *           enum: [csv, json]
 *       - in: query
 *         name: table
 *         required: true
 *         description: |
 *           The name of the usage table to retrieve:
 *           - "users": The list of users categorized by their activity level.
 *           - "inactive_users": The of users that didn't sent any messages
 *           - "assistant_messages": The list of messages sent by users including the mentioned agents.
 *           - "builders": The list of builders categorized by their activity level.
 *           - "assistants": The list of workspace agents and their corresponding usage.
 *           - "feedback": The list of feedback given by users on the agent messages.
 *           - "all": A concatenation of all the above tables.
 *         schema:
 *           type: string
 *           enum: [users, inactive_users, assistant_messages, builders, assistants, feedback, all]
 *     responses:
 *       200:
 *         description: The usage data in CSV or JSON format, or a ZIP of multiple CSVs if table is equal to "all"
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *           application/json:
 *             schema:
 *               type: object
 *           application/zip:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Invalid request query
 *       403:
 *         description: The workspace does not have access to the usage data API
 *       404:
 *         description: The workspace was not found
 *       405:
 *         description: Method not supported
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWorkspaceUsageResponseType>>,
  auth: Authenticator
): Promise<void> {
  const owner = auth.getNonNullableWorkspace();
  const flags = await getFeatureFlags(owner);
  if (!flags.includes("usage_data_api")) {
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
      const r = GetWorkspaceUsageRequestSchema.safeParse(req.query);
      if (r.error) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: fromError(r.error).toString(),
          },
        });
      }

      const query = r.data;

      // Add validation for JSON format with 'all' table
      if (query.format === "json" && query.table === "all") {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "JSON format is not supported with table='all'. Please use CSV format instead.",
          },
        });
      }

      const { endDate, startDate } = resolveDates(query);
      const data = await fetchUsageData({
        table: query.table,
        start: startDate,
        end: endDate,
        workspace: owner,
      });

      if (query.format === "json") {
        const csvData = data[query.table];
        if (!csvData) {
          return apiError(req, res, {
            status_code: 400,
            api_error: {
              type: "invalid_request_error",
              message: "No data found for the specified table.",
            },
          });
        }

        // Parse CSV string into JSON
        const records = parseCSV(csvData, {
          columns: true, // Use first row as headers
          skip_empty_lines: true,
        });

        res.setHeader("Content-Type", "application/json");
        res.status(200).json(records);
        return;
      }

      const zip = new JSZip();
      const csvSuffix = startDate
        .toLocaleString("default", { month: "short" })
        .toLowerCase();
      for (const [fileName, csvData] of Object.entries(data)) {
        if (csvData) {
          zip.file(
            `${fileName}_${startDate.getFullYear()}_${csvSuffix}.csv`,
            csvData
          );
        }
      }

      if (query.table === "all") {
        const zipContent = await zip.generateAsync({ type: "nodebuffer" });
        res.setHeader("Content-Type", "application/zip");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="usage.zip"`
        );
        res.status(200).send(zipContent);
      } else {
        res.setHeader("Content-Type", "text/csv");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${query.table}.csv"`
        );
        const csvData = data[query.table];
        res.status(200).send(csvData);
      }
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

function resolveDates(query: GetWorkspaceUsageRequestType) {
  const parseDate = (dateString: string) => {
    const parts = dateString.split("-");
    return new Date(
      parseInt(parts[0]),
      parseInt(parts[1]) - 1,
      parts[2] ? parseInt(parts[2]) : 1
    );
  };

  switch (query.mode) {
    case "month":
      const date = parseDate(query.start);
      return { startDate: date, endDate: endOfMonth(date) };
    case "range":
      return {
        startDate: parseDate(query.start),
        endDate: parseDate(query.end),
      };
    default:
      assertNever(query);
  }
}

async function fetchUsageData({
  table,
  start,
  end,
  workspace,
}: {
  table: UsageTableType;
  start: Date;
  end: Date;
  workspace: WorkspaceType;
}): Promise<Partial<Record<UsageTableType, string>>> {
  switch (table) {
    case "users":
      return { users: await getUserUsageData(start, end, workspace) };
    case "assistant_messages":
      return {
        assistant_messages: await getMessageUsageData(start, end, workspace),
      };
    case "builders":
      return { builders: await getBuildersUsageData(start, end, workspace) };
    case "assistants":
      return {
        assistants: await getAssistantsUsageData(start, end, workspace),
      };
    case "feedback":
      return {
        feedback: await getFeedbackUsageData(start, end, workspace),
      };
    case "all":
      const [users, assistant_messages, builders, assistants, feedback] =
        await Promise.all([
          getUserUsageData(start, end, workspace),
          getMessageUsageData(start, end, workspace),
          getBuildersUsageData(start, end, workspace),
          getAssistantsUsageData(start, end, workspace),
          getFeedbackUsageData(start, end, workspace),
        ]);
      return {
        users,
        assistant_messages,
        builders,
        assistants,
        feedback,
      };
    default:
      return {};
  }
}

export default withPublicAPIAuthentication(handler);
