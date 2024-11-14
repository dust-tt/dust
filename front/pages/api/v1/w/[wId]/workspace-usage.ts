import type {
  GetWorkspaceUsageRequestType,
  UsageTableType,
} from "@dust-tt/client";
import { GetWorkspaceUsageRequestSchema } from "@dust-tt/client";
import { assertNever } from "@dust-tt/types";
import { endOfMonth } from "date-fns/endOfMonth";
import JSZip from "jszip";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  getAssistantsUsageData,
  getBuildersUsageData,
  getMessageUsageData,
  getUserUsageData,
} from "@app/lib/workspace_usage";
import { apiError } from "@app/logger/withlogging";

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
 *         description: The mode of date range selection ('month' or 'range')
 *         schema:
 *           type: string
 *           enum: [month, range]
 *       - in: query
 *         name: table
 *         required: true
 *         description: |
 *           The name of the usage table to retrieve:
 *           - "users": The list of users categorized by their activity level.
 *           - "assistant_messages": The list of messages sent by users including the mentioned assistants.
 *           - "builders": The list of builders categorized by their activity level.
 *           - "assistants": The list of workspace assistants and their corresponding usage.
 *           - "all": A concatenation of all the above tables.
 *         schema:
 *           type: string
 *           enum: [users, assistant_messages, builders, assistants, all]
 *     responses:
 *       200:
 *         description: The usage data in CSV format or a ZIP of multiple CSVs if table is equal to "all"
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
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
  res: NextApiResponse,
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
            message: `Invalid request body: ${r.error.message}`,
          },
        });
      }

      const query = r.data;
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
        res.status(200).send(csvData[query.table]);
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
        endDate: endOfMonth(parseDate(query.end)),
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
  table: UsageTableType;
  start: Date;
  end: Date;
  workspaceId: string;
}): Promise<Partial<Record<UsageTableType, string>>> {
  switch (table) {
    case "users":
      return { users: await getUserUsageData(start, end, workspaceId) };
    case "assistant_messages":
      return {
        assistant_messages: await getMessageUsageData(start, end, workspaceId),
      };
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

export default withPublicAPIAuthentication(handler);
