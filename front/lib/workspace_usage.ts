import { stringify } from "csv-stringify/sync";
import { format } from "date-fns/format";
import { Op, QueryTypes, Sequelize } from "sequelize";

import { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  Conversation,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { User } from "@app/lib/models/user";
import { Workspace } from "@app/lib/models/workspace";
import { DataSourceResource } from "@app/lib/resources/datasource_resource";

import { frontSequelize } from "./resources/storage";

export interface WorkspaceUsageQueryResult {
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

interface MessageUsageQueryResult {
  message_id: number;
  created_at: Date;
  assistant_id: string;
  assistant_name: string;
  workspace_id: number;
  workspace_name: string;
  conversation_id: number;
  parent_message_id: number | null;
  user_message_id: number | null;
  user_id: number | null;
  user_email: string | null;
  source: string | null;
}

type UserUsageQueryResult = {
  userName: string;
  userEmail: string;
  messageCount: number;
  lastMessageSent: string;
  activeDaysCount: number;
};

type BuilderUsageQueryResult = {
  userEmail: string;
  userFirstName: string;
  userLastName: string;
  agentsEditionsCount: number;
  distinctAgentsEditionsCount: number;
  lastEditAt: string;
};

interface AgentUsageQueryResult {
  name: string;
  description: string;
  settings: "shared" | "private" | "company";
  authorEmails: string[];
  messages: number;
  distinctUsersReached: number;
  lastConfiguration: Date;
}

export async function unsafeGetUsageData(
  startDate: Date,
  endDate: Date,
  wId: string
): Promise<string> {
  const results = await frontSequelize.query<WorkspaceUsageQueryResult>(
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
            WHEN COUNT(DISTINCT arc."id") > 0 AND COUNT(DISTINCT atqc."id") = 0 AND COUNT(DISTINCT adarc."id") = 0 THEN 'retrieval'
            WHEN COUNT(DISTINCT arc."id") = 0 AND COUNT(DISTINCT atqc."id") > 0 AND COUNT(DISTINCT adarc."id") = 0 THEN 'tablesQuery'
            WHEN COUNT(DISTINCT arc."id") = 0 AND COUNT(DISTINCT atqc."id") = 0 AND COUNT(DISTINCT adarc."id") > 0 THEN 'dustAppRun'
            WHEN COUNT(DISTINCT arc."id") + COUNT(DISTINCT atqc."id") + COUNT(DISTINCT adarc."id") > 1 THEN 'multiActions'
            ELSE NULL
        END AS "actionType",
        um."userContextOrigin" AS "source"
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
        "agent_retrieval_configurations" arc ON ac."id" = arc."agentConfigurationId"
    LEFT JOIN
        "agent_tables_query_configurations" atqc ON ac."id" = atqc."agentConfigurationId"
    LEFT JOIN
        "agent_dust_app_run_configurations" adarc ON ac."id" = adarc."agentConfigurationId"
    LEFT JOIN
        "messages" p ON m."parentId" = p."id"
    WHERE
        w."sId" = :wId AND
        m."createdAt" >= :startDate AND m."createdAt" <= :endDate
    GROUP BY
        m."id", c."id", um."id", am."id", cf."id", ac."id", p."id"
    ORDER BY
        m."createdAt" DESC
    `,
    {
      replacements: {
        wId,
        startDate: format(startDate, "yyyy-MM-dd'T'00:00:00"), // Use first day of start month
        endDate: format(endDate, "yyyy-MM-dd'T'23:59:59"), // Use last day of end month
      },
      type: QueryTypes.SELECT,
    }
  );
  if (!results.length) {
    return "No data available for the selected period.";
  }
  return generateCsvFromQueryResult(results);
}

export async function getMessageUsageData(
  startDate: Date,
  endDate: Date,
  workspaceId: string
): Promise<string> {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }
  const wId = workspace.id;
  const results = await frontSequelize.query<MessageUsageQueryResult>(
    `
      SELECT
        am."id" AS "message_id",
        TO_CHAR(am."createdAt"::timestamp, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
        COALESCE(ac."sId", am."agentConfigurationId") AS "assistant_id",
        COALESCE(ac."name", am."agentConfigurationId") AS "assistant_name",
        w."id" AS "workspace_id",
        w."name" AS "workspace_name",
        c."id" AS "conversation_id",
        m."parentId" AS "parent_message_id",
        um."id" AS "user_message_id",
        um."userId" AS "user_id",
        um."userContextEmail" AS "user_email",
        um."userContextOrigin" AS "source"
      FROM
        "agent_messages" am
      JOIN
        "messages" m ON am."id" = m."agentMessageId"
      JOIN
        "conversations" c ON m."conversationId" = c."id"
      JOIN
        "workspaces" w ON c."workspaceId" = w."id"
      LEFT JOIN
        "agent_configurations" ac ON am."agentConfigurationId" = ac."sId" AND am."agentConfigurationVersion" = ac."version"
      LEFT JOIN 
        "messages" m2 on m."parentId" = m2."id"
      LEFT JOIN
        "user_messages" um on m2."userMessageId" = um."id"
      WHERE
        am."status" = 'succeeded'
        AND w."id" = :wId
        AND am."createdAt" BETWEEN :startDate AND :endDate
    `,
    {
      replacements: {
        wId,
        startDate: format(startDate, "yyyy-MM-dd'T'00:00:00"), // Use first day of start month
        endDate: format(endDate, "yyyy-MM-dd'T'23:59:59"), // Use last day of end month
      },
      type: QueryTypes.SELECT,
    }
  );
  if (!results.length) {
    return "No data available for the selected period.";
  }
  return generateCsvFromQueryResult(results);
}

export async function getUserUsageData(
  startDate: Date,
  endDate: Date,
  workspaceId: string
): Promise<string> {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }
  const wId = workspace.id;
  const userMessages = await Message.findAll({
    attributes: [
      "userMessage.userId",
      "userMessage.userContextFullName",
      "userMessage.userContextEmail",
      [Sequelize.fn("COUNT", Sequelize.col("userMessage.id")), "count"],
      [
        Sequelize.cast(
          Sequelize.fn("MAX", Sequelize.col("userMessage.createdAt")),
          "DATE"
        ),
        "lastMessageSent",
      ],
      [
        Sequelize.fn(
          "COUNT",
          Sequelize.fn(
            "DISTINCT",
            Sequelize.fn("DATE", Sequelize.col("userMessage.createdAt"))
          )
        ),
        "activeDaysCount",
      ],
    ],
    where: {
      createdAt: {
        [Op.gt]: startDate,
        [Op.lt]: endDate,
      },
    },
    include: [
      {
        model: UserMessage,
        as: "userMessage",
        required: true,
        attributes: [],
        where: {
          userId: {
            [Op.not]: null,
          },
        },
      },
      {
        model: Conversation,
        as: "conversation",
        attributes: [],
        required: true,
        where: {
          workspaceId: wId,
        },
      },
    ],
    group: [
      "userMessage.userId",
      "userMessage.userContextFullName",
      "userMessage.userContextEmail",
    ],
    order: [["count", "DESC"]],
    raw: true,
  });
  const userUsage: UserUsageQueryResult[] = userMessages.map((result) => {
    return {
      userName: (result as unknown as { userContextFullName: string })
        .userContextFullName,
      userEmail: (result as unknown as { userContextEmail: string })
        .userContextEmail,
      messageCount: (result as unknown as { count: number }).count,
      lastMessageSent: (result as unknown as { lastMessageSent: string })
        .lastMessageSent,
      activeDaysCount: (result as unknown as { activeDaysCount: number })
        .activeDaysCount,
    };
  });
  if (!userUsage.length) {
    return "No data available for the selected period.";
  }
  return generateCsvFromQueryResult(userUsage);
}

export async function getBuildersUsageData(
  startDate: Date,
  endDate: Date,
  workspaceId: string
): Promise<string> {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }
  const wId = workspace.id;
  const agentConfigurations = await AgentConfiguration.findAll({
    attributes: [
      [
        Sequelize.fn("COUNT", Sequelize.col("agent_configuration.sId")),
        "agentsEditionsCount",
      ],
      "user.email",
      "user.firstName",
      "user.lastName",
      [
        Sequelize.fn(
          "COUNT",
          Sequelize.literal('DISTINCT "agent_configuration"."sId"')
        ),
        "distinctAgentsEditionsCount",
      ],
      [
        Sequelize.cast(
          Sequelize.fn("MAX", Sequelize.col("agent_configuration.updatedAt")),
          "DATE"
        ),
        "lastEditAt",
      ],
    ],
    where: {
      workspaceId: wId,
      createdAt: {
        [Op.gt]: startDate,
        [Op.lt]: endDate,
      },
    },
    include: [
      {
        model: User,
        as: "user",
        attributes: [],
        required: true,
      },
    ],
    raw: true,
    group: ["authorId", "user.email", "user.firstName", "user.lastName"],
  });
  const buildersUsage: BuilderUsageQueryResult[] = agentConfigurations.map(
    (result) => {
      const castResult = result as unknown as {
        firstName: string;
        lastName: string;
        email: string;
        agentsEditionsCount: number;
        distinctAgentsEditionsCount: number;
        lastEditAt: string;
      };
      return {
        userFirstName: castResult.firstName,
        userLastName: castResult.lastName,
        userEmail: castResult.email,
        agentsEditionsCount: castResult.agentsEditionsCount,
        distinctAgentsEditionsCount: castResult.distinctAgentsEditionsCount,
        lastEditAt: castResult.lastEditAt,
      };
    }
  );

  if (!buildersUsage.length) {
    return "No data available for the selected period.";
  }
  return generateCsvFromQueryResult(buildersUsage);
}

export async function getAssistantsUsageData(
  startDate: Date,
  endDate: Date,
  workspaceId: string
): Promise<string> {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Workspace not found for sId: ${workspaceId}`);
  }
  const wId = workspace.id;
  const mentions = await frontSequelize.query<AgentUsageQueryResult>(
    `
    SELECT
      ac."name",
      ac."description",
      CASE
        WHEN ac."scope" = 'published' THEN 'shared'
        WHEN ac."scope" = 'private' THEN 'private'
        ELSE 'company'
      END AS "settings",
      ARRAY_AGG(DISTINCT aut."email") AS "authorEmails",
      COUNT(a."id") AS "messages",
      COUNT(DISTINCT u."id") AS "distinctUsersReached",
      MAX(CAST(ac."createdAt" AS DATE)) AS "lastEdit"
    FROM
      "agent_messages" a
      JOIN "messages" m ON a."id" = m."agentMessageId"
      JOIN "messages" parent ON m."parentId" = parent."id"
      JOIN "user_messages" um ON um."id" = parent."userMessageId"
      JOIN "users" u ON um."userId" = u."id"
      JOIN "agent_configurations" ac ON a."agentConfigurationId" = ac."sId"
      JOIN "users" aut ON ac."authorId" = aut."id"
    WHERE
      a."createdAt" BETWEEN :startDate AND :endDate
      AND ac."workspaceId" = ${wId}
      AND ac."status" = 'active'
      AND ac."scope" != 'private'
    GROUP BY
      ac."name",
      ac."description",
      ac."scope"
    ORDER BY
      "messages" DESC;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        startDate: format(startDate, "yyyy-MM-dd'T'00:00:00"), // Use first day of start month
        endDate: format(endDate, "yyyy-MM-dd'T'23:59:59"), // Use last day of end month
      },
    }
  );
  if (!mentions.length) {
    return "No data available for the selected period.";
  }
  return generateCsvFromQueryResult(mentions);
}

function generateCsvFromQueryResult(
  rows:
    | WorkspaceUsageQueryResult[]
    | UserUsageQueryResult[]
    | AgentUsageQueryResult[]
    | MessageUsageQueryResult[]
    | BuilderUsageQueryResult[]
) {
  if (rows.length === 0) {
    return "";
  }

  const headers = Object.keys(rows[0]);
  const data = rows.map((row) => Object.values(row));

  return stringify([headers, ...data], {
    header: false,
    cast: {
      date: (value) => value.toISOString(),
    },
  });
}

/**
 * Check if a workspace is active during a trial based on the following conditions:
 *   - Existence of a connected data source
 *   - Existence of a custom assistant
 *   - A conversation occurred within the past 7 days
 */
export async function checkWorkspaceActivity(workspace: Workspace) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const hasDataSource = await DataSourceResource.workspaceHasDatasources(
    await Authenticator.internalAdminForWorkspace(workspace.sId)
  );

  const hasCreatedAssistant = await AgentConfiguration.findOne({
    where: { workspaceId: workspace.id },
  });

  const hasRecentConversation = await Conversation.findOne({
    where: { workspaceId: workspace.id, updatedAt: { [Op.gte]: sevenDaysAgo } },
  });

  return hasDataSource || hasCreatedAssistant || hasRecentConversation;
}
