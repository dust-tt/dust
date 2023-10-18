import { NextApiRequest, NextApiResponse } from "next";
import { QueryTypes } from "sequelize";

import { Authenticator, getSession } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import { apiError, withLogging } from "@app/logger/withlogging";

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
      if (
        !req.query.referenceDate ||
        typeof req.query.referenceDate !== "string" ||
        isNaN(new Date(req.query.referenceDate).getTime())
      ) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The `referenceDate` query parameter is missing or invalid.",
          },
        });
      }
      const referenceDate = new Date(req.query.referenceDate);
      const csvData = await getMonthlyUsage(referenceDate, owner.sId);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=dust_monthly_usage_${referenceDate.getFullYear()}_${
          referenceDate.getMonth() + 1
        }.csv`
      );
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

async function getMonthlyUsage(
  referenceDate: Date,
  wId: string
): Promise<string> {
  const results = await front_sequelize.query<QueryResult>(
    `
    SELECT 
      TO_CHAR(m."createdAt"::timestamp, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
      c."id" AS "conversationModelId",
      m."id" as "messageId",
      um."id" AS "userMessageId", 
      am."id" AS "agentMessageId",
      u."id" as "userId",
      um."userContextFullName" AS "userFullName",
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
      "agent_configurations" ac ON am."agentConfigurationId" = ac."sId" AND am."agentConfigurationVersion" = ac."version"
  WHERE 
      w."sId" = :wId AND
      DATE_TRUNC('month', m."createdAt") = DATE_TRUNC('month', :referenceDate::timestamp)
  ORDER BY 
      "createdAt" DESC
  `,
    {
      replacements: {
        wId,
        referenceDate: `${referenceDate.getFullYear()}-${
          referenceDate.getMonth() + 1
        }-${referenceDate.getDate()}`,
      },
      type: QueryTypes.SELECT,
    }
  );
  if (!results.length) {
    return "You have no data for this month.";
  }
  const csvContent = results
    .map((row) => Object.values(row).join(","))
    .join("\n");
  const csvHeader = Object.keys(results[0]).join(",") + "\n";
  return csvHeader + csvContent;
}
