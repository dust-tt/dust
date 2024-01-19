import { assertNever } from "@dust-tt/types";
import { endOfMonth, format } from "date-fns";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";
import { QueryTypes } from "sequelize";

import { Authenticator, getSession } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import { apiError, withLogging } from "@app/logger/withlogging";

const MonthSchema = t.refinement(
  t.string,
  (s): s is string => /^\d{4}-(0[1-9]|1[0-2])$/.test(s),
  "YYYY-MM"
);

const GetUsageQueryParamsSchema = t.union([
  t.type({
    start: t.undefined,
    end: t.undefined,
    mode: t.literal("all"),
  }),
  t.type({
    start: MonthSchema,
    end: t.undefined,
    mode: t.literal("month"),
  }),
  t.type({
    start: MonthSchema,
    end: MonthSchema,
    mode: t.literal("range"),
  }),
]);

interface QueryResult {
  createdAt: string;
  conversationModelId: string;
  messageId: string;
  userMessageId: string;
  agentMessageId: string;
  userId: string;
  userFirstName: string;
  userLastName: string;
  assistantId: string;
  assistantName: string;
  actionType: string;
  source: string;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  const session = await getSession(req, res);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users that are `admins` for the current workspace can retrieve its monthly usage.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      const queryValidation = GetUsageQueryParamsSchema.decode(req.query);
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

      const { endDate, startDate } = (() => {
        switch (query.mode) {
          case "all":
            return {
              startDate: new Date("2020-01-01"),
              endDate: new Date(),
            };
          case "month":
            const date = new Date(`${query.start}-01`);
            return {
              startDate: date,
              endDate: endOfMonth(date),
            };
          case "range":
            return {
              startDate: new Date(`${query.start}-01`),
              endDate: endOfMonth(new Date(`${query.end}-01`)),
            };
          default:
            assertNever(query);
        }
      })();

      const csvData = await getUsageData(startDate, endDate, owner.sId);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="usage.csv"`);
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

async function getUsageData(
  startDate: Date,
  endDate: Date,
  wId: string
): Promise<string> {
  const results = await front_sequelize.query<QueryResult>(
    `
    SELECT
      TO_CHAR(m."createdAt"::timestamp, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
      c."id" AS "conversationInternalId",
      m."sId" AS "messageId",
      p."sId" AS "parentMessageId",
      CASE
        WHEN um."id" IS NOT NULL THEN 'user'
        WHEN am."id" IS NOT NULL THEN 'assistant'
        WHEN cf."id" IS NOT NULL THEN 'content_fragment'
      END AS "messageType",
      um."userContextFullName" AS "userFullName",
      um."userContextEmail" AS "userEmail",
      COALESCE(ac."sId", am."agentConfigurationId") AS "assistantId",
      COALESCE(ac."name", am."agentConfigurationId") AS "assistantName",
      CASE
          WHEN ac."retrievalConfigurationId" IS NOT NULL THEN 'retrieval'
          WHEN ac."dustAppRunConfigurationId" IS NOT NULL THEN 'dustAppRun'
          ELSE NULL
      END AS "actionType",
      CASE
          WHEN um."id" IS NOT NULL THEN
              CASE
                  WHEN um."userId" IS NOT NULL THEN 'web'
                  ELSE 'slack'
              END
      END AS "source"
  FROM
      "messages" m
  JOIN
      "conversations" c ON m."conversationId" = c."id"
  JOIN
      "workspaces" w ON c."workspaceId" = w."id"
  LEFT JOIN
      "user_messages" um ON m."userMessageId" = um."id"
  LEFT JOIN
      "users" u ON um."userId" = u."id"
  LEFT JOIN
      "agent_messages" am ON m."agentMessageId" = am."id"
  LEFT JOIN
      "content_fragments" cf ON m."contentFragmentId" = cf."id"
  LEFT JOIN
      "agent_configurations" ac ON am."agentConfigurationId" = ac."sId" AND am."agentConfigurationVersion" = ac."version"
  LEFT JOIN
      "messages" p ON m."parentId" = p."id"
  WHERE
      w."sId" = :wId AND
      m."createdAt" >= :startDate AND m."createdAt" <= :endDate
  ORDER BY
      m."createdAt" DESC
  `,
    {
      replacements: {
        wId,
        startDate: format(startDate, "yyyy-MM-dd"), // Use first day of start month
        endDate: format(endDate, "yyyy-MM-dd"), // Use last day of end month
      },
      type: QueryTypes.SELECT,
    }
  );
  if (!results.length) {
    return "No data available for the selected period.";
  }
  const csvHeader = Object.keys(results[0]).join(",") + "\n";
  const csvContent = results
    .map((row) => Object.values(row).join(","))
    .join("\n");

  return csvHeader + csvContent;
}
