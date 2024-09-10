import { assertNever } from "@dust-tt/types";
import { endOfMonth } from "date-fns/endOfMonth";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import JSZip from "jszip";
import type { NextApiRequest, NextApiResponse } from "next";

import { withPublicApiAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  getAssistantsUsageData,
  getBuildersUsageData,
  getMessageUsageData,
  getUserUsageData,
} from "@app/lib/workspace_usage";
import { apiError } from "@app/logger/withlogging";
import { getSupportedUsageTablesCodec } from "@app/pages/api/w/[wId]/workspace-usage";

export const usageTables = [
  "users",
  "assistant_messages",
  "builders",
  "assistants",
  "all",
];
type usageTableType = (typeof usageTables)[number];

const MonthSchema = t.refinement(
  t.string,
  (s): s is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(s),
  "YYYY-MM"
);

const GetWorkspaceUsageSchema = t.union([
  t.type({
    start: MonthSchema,
    end: t.undefined,
    mode: t.literal("month"),
    table: getSupportedUsageTablesCodec(),
  }),
  t.type({
    start: MonthSchema,
    end: MonthSchema,
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
 *         name: start
 *         required: true
 *         description: The start date in YYYY-MM format
 *         schema:
 *           type: string
 *       - in: query
 *         name: end
 *         required: false
 *         description: The end date in YYYY-MM format (required when mode is 'range')
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

export default withPublicApiAuthentication(handler);
