import { stringify } from "csv-stringify/sync";
import { format } from "date-fns/format";
import { Op, QueryTypes, Sequelize } from "sequelize";

import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfiguration } from "@app/lib/models/assistant/agent";
import {
  ConversationModel,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { UserModel } from "@app/lib/resources/storage/models/user";
import { getAgentRoute } from "@app/lib/utils/router";
import type {
  LightAgentConfigurationType,
  ModelId,
  WorkspaceType,
} from "@app/types";

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
  groups: string;
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
  settings: "published" | "unpublished" | "unknown";
  modelId: string;
  providerId: string;
  authorEmails: string[];
  messages: number;
  distinctUsersReached: number;
  lastConfiguration: Date;
}

interface FeedbackQueryResult {
  id: ModelId;
  createdAt: Date;
  userName: string;
  userEmail: string;
  agentConfigurationId: string;
  agentConfigurationVersion: number;
  thumb: "up" | "down";
  content: string | null;
  conversationUrl: string | null;
}

type GroupMembershipQueryResult = {
  userId: string;
  groups: string;
};

type GroupMembershipWithGroup = GroupMembershipModel & {
  group: GroupModel;
};

export async function unsafeGetUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType
): Promise<string> {
  const wId = workspace.sId;

  const readReplica = getFrontReplicaDbConnection();

  // eslint-disable-next-line dust/no-raw-sql -- Leggit
  const results = await readReplica.query<WorkspaceUsageQueryResult>(
    `
      SELECT TO_CHAR(m."createdAt"::timestamp, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
             c."id"                                                     AS "conversationInternalId",
             m."sId"                                                    AS "messageId",
             p."sId"                                                    AS "parentMessageId",
             CASE
               WHEN um."id" IS NOT NULL THEN 'user'
               WHEN am."id" IS NOT NULL THEN 'assistant'
               WHEN cf."id" IS NOT NULL THEN 'content_fragment'
               END                                                      AS "messageType",
             um."userContextFullName"                                   AS "userFullName",
             LOWER(um."userContextEmail")                               AS "userEmail",
             COALESCE(ac."sId", am."agentConfigurationId")              AS "assistantId",
             COALESCE(ac."name", am."agentConfigurationId")             AS "assistantName",
             msv."internalMCPServerId"                                  AS "actionType",
             um."userContextOrigin"                                     AS "source"
      FROM "messages" m
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
           "agent_configurations" ac
           ON am."agentConfigurationId" = ac."sId" AND am."agentConfigurationVersion" = ac."version"
             LEFT JOIN
           "agent_mcp_server_configurations" amsc ON ac."id" = amsc."agentConfigurationId"
             LEFT JOIN
           "mcp_server_views" msv ON amsc."mcpServerViewId" = msv."id"
             LEFT JOIN
           "messages" p ON m."parentId" = p."id"
      WHERE w."sId" = :wId
        AND m."createdAt" >= :startDate
        AND m."createdAt" <= :endDate
      GROUP BY m."id", c."id", um."id", am."id", cf."id", ac."id", p."id", msv."internalMCPServerId"
      ORDER BY m."createdAt" DESC
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
  } else {
    // Do a second pass to replace the internalMCPServerId with the names.
    const lookup = new Map<string, string>();
    for (const result of results) {
      if (!result.actionType) {
        continue;
      }

      let name = lookup.get(result.actionType);
      if (!name) {
        const r = getInternalMCPServerNameAndWorkspaceId(result.actionType);
        if (r.isOk()) {
          name = r.value.name;
        } else {
          name = "unknown";
        }
        lookup.set(result.actionType, name);
      }
      result.actionType = name;
    }
  }
  return generateCsvFromQueryResult(results);
}

export async function getMessageUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType
): Promise<string> {
  const wId = workspace.id;
  const readReplica = getFrontReplicaDbConnection();
  // eslint-disable-next-line dust/no-raw-sql -- Leggit
  const results = await readReplica.query<MessageUsageQueryResult>(
    `
      SELECT am."id"                                                     AS "message_id",
             TO_CHAR(am."createdAt"::timestamp, 'YYYY-MM-DD HH24:MI:SS') AS "createdAt",
             COALESCE(ac."sId", am."agentConfigurationId")               AS "assistant_id",
             COALESCE(ac."name", am."agentConfigurationId")              AS "assistant_name",
             CASE
               WHEN ac."scope" = 'visible' THEN 'published'
               WHEN ac."scope" = 'hidden' THEN 'unpublished'
               ELSE 'unknown'
               END                                                       AS "assistant_settings",
             w."id"                                                      AS "workspace_id",
             w."name"                                                    AS "workspace_name",
             c."id"                                                      AS "conversation_id",
             m."parentId"                                                AS "parent_message_id",
             um."id"                                                     AS "user_message_id",
             um."userId"                                                 AS "user_id",
             LOWER(um."userContextEmail")                                AS "user_email",
             um."userContextOrigin"                                      AS "source"
      FROM "agent_messages" am
             JOIN
           "messages" m ON am."id" = m."agentMessageId"
             JOIN
           "conversations" c ON m."conversationId" = c."id"
             JOIN
           "workspaces" w ON c."workspaceId" = w."id"
             LEFT JOIN
           "agent_configurations" ac
           ON am."agentConfigurationId" = ac."sId" AND am."agentConfigurationVersion" = ac."version"
             LEFT JOIN
           "messages" m2 on m."parentId" = m2."id"
             LEFT JOIN
           "user_messages" um on m2."userMessageId" = um."id"
      WHERE am."status" = 'succeeded'
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

export async function getGroupMembershipsData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType
): Promise<string> {
  const wId = workspace.id;
  const userGroupsMap = await getUserGroupMemberships(wId, startDate, endDate);

  const groupMembershipsData: GroupMembershipQueryResult[] = Object.entries(
    userGroupsMap
  ).map(([userId, groups]) => ({
    userId,
    groups,
  }));

  if (!groupMembershipsData.length) {
    return "No group memberships data available.";
  }
  return generateCsvFromQueryResult(groupMembershipsData);
}

export async function getUserGroupMemberships(
  workspaceId: number,
  startDate: Date,
  endDate: Date
): Promise<Record<string, string>> {
  const groupMemberships = await getFrontReplicaDbConnection().transaction(
    async (t) => {
      const whereClause = {
        workspaceId,
        [Op.and]: [
          { startAt: { [Op.lte]: endDate } },
          {
            [Op.or]: [{ endAt: null }, { endAt: { [Op.gte]: startDate } }],
          },
        ],
      };

      return GroupMembershipModel.findAll({
        where: whereClause,
        include: [
          {
            model: GroupModel,
            as: "group",
            attributes: ["name"],
            required: true,
            where: {
              kind: {
                [Op.in]: ["provisioned"],
              },
            },
          },
        ],
        transaction: t,
      }) as Promise<GroupMembershipWithGroup[]>;
    }
  );

  const result: Record<string, string> = {};
  groupMemberships.forEach((membership) => {
    const userId = membership.userId.toString();
    const groupName = membership.group.name;
    result[userId] = result[userId]
      ? `${result[userId]}, ${groupName}`
      : groupName;
  });

  return result;
}

export async function getUserUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType
): Promise<string> {
  const wId = workspace.id;

  const allUserMessages = await getFrontReplicaDbConnection().transaction(
    async (t) => {
      return Message.findAll({
        attributes: [
          "userMessage.userId",
          [
            Sequelize.fn(
              "MAX",
              Sequelize.col("userMessage.userContextFullName")
            ),
            "userContextFullName",
          ],
          [
            Sequelize.fn(
              "LOWER",
              Sequelize.col("userMessage.userContextEmail")
            ),
            "userContextEmail",
          ],
          "userMessage.userContextOrigin",
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
          workspaceId: wId,
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
            model: ConversationModel,
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
          Sequelize.fn("LOWER", Sequelize.col("userMessage.userContextEmail")),
          "userMessage.userContextOrigin",
        ],
        order: [["count", "DESC"]],
        raw: true,
        transaction: t,
      });
    }
  );

  // Filter out agent messages (userContextOrigin === "run_agent")
  // Since agents always have userContextOrigin="run_agent" and humans have
  // other values, they form separate grouped records. Filtering post-GROUP BY
  // produces identical results to a database WHERE clause but reduces DB load.
  const userMessages = allUserMessages.filter((message) => {
    const origin = (message as unknown as { userContextOrigin: string })
      .userContextOrigin;
    return origin !== "run_agent";
  });

  const userGroupsMap = await getUserGroupMemberships(wId, startDate, endDate);

  const userAggregates = new Map<string, UserUsageQueryResult>();

  userMessages.forEach((result) => {
    const userId = String((result as unknown as { userId: number }).userId);
    const userEmail = (result as unknown as { userContextEmail: string })
      .userContextEmail;
    const existing = userAggregates.get(userEmail);
    const current = {
      userId,
      userName: (result as unknown as { userContextFullName: string })
        .userContextFullName,
      userEmail,
      messageCount: (result as unknown as { count: number }).count,
      lastMessageSent: (result as unknown as { lastMessageSent: string })
        .lastMessageSent,
      activeDaysCount: (result as unknown as { activeDaysCount: number })
        .activeDaysCount,
      groups: userGroupsMap[userId] || "",
    };

    if (existing) {
      userAggregates.set(userEmail, {
        ...existing,
        userName: current.userName,
        messageCount: existing.messageCount + current.messageCount,
        lastMessageSent:
          current.lastMessageSent > existing.lastMessageSent
            ? current.lastMessageSent
            : existing.lastMessageSent,
        activeDaysCount: Math.max(
          existing.activeDaysCount,
          current.activeDaysCount
        ),
      });
    } else {
      userAggregates.set(userEmail, current);
    }
  });

  const userUsage = Array.from(userAggregates.values()).sort(
    (a, b) => b.messageCount - a.messageCount
  );

  if (!userUsage.length) {
    return "No data available for the selected period.";
  }
  return generateCsvFromQueryResult(userUsage);
}

export async function getBuildersUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType
): Promise<string> {
  const wId = workspace.id;
  const agentConfigurations = await getFrontReplicaDbConnection().transaction(
    async (t) => {
      return AgentConfiguration.findAll({
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
              Sequelize.fn(
                "MAX",
                Sequelize.col("agent_configuration.updatedAt")
              ),
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
          status: {
            [Op.not]: "draft",
          },
        },
        include: [
          {
            model: UserModel,
            as: "user",
            attributes: [],
            required: true,
          },
        ],
        raw: true,
        group: ["authorId", "user.email", "user.firstName", "user.lastName"],
        transaction: t,
      });
    }
  );
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

export async function getAssistantUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType,
  agentConfiguration: LightAgentConfigurationType
): Promise<number> {
  const wId = workspace.id;
  const readReplica = getFrontReplicaDbConnection();
  // eslint-disable-next-line dust/no-raw-sql -- Leggit
  const mentions = await readReplica.query<{ messages: number }>(
    `
      SELECT COUNT(a."id") AS "messages"
      FROM "agent_messages" a
             JOIN "agent_configurations" ac ON a."agentConfigurationId" = ac."sId"
      WHERE a."createdAt" BETWEEN :startDate AND :endDate
        AND ac."workspaceId" = :wId
        AND ac."status" = 'active'
        AND ac."sId" = :agentConfigurationId
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        startDate: format(startDate, "yyyy-MM-dd'T'00:00:00"),
        endDate: format(endDate, "yyyy-MM-dd'T'23:59:59"),
        agentConfigurationId: agentConfiguration.sId,
        wId,
      },
    }
  );

  if (!mentions.length) {
    return 0;
  }
  return mentions[0].messages;
}

export async function getAssistantsUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType
): Promise<string> {
  const wId = workspace.id;
  const readReplica = getFrontReplicaDbConnection();
  // eslint-disable-next-line dust/no-raw-sql -- Leggit
  const mentions = await readReplica.query<AgentUsageQueryResult>(
    `
      SELECT ac."name",
             ac."description",
             ac."modelId",
             ac."providerId",
             CASE
               WHEN ac."scope" = 'visible' THEN 'published'
               WHEN ac."scope" = 'hidden' THEN 'unpublished'
               ELSE 'unknown'
               END                              AS "settings",
             ARRAY_AGG(DISTINCT aut."email")    AS "authorEmails",
             COUNT(a."id")                      AS "messages",
             COUNT(DISTINCT u."id")             AS "distinctUsersReached",
             COUNT(DISTINCT m."conversationId") AS "distinctConversations",
             MAX(CAST(ac."createdAt" AS DATE))  AS "lastEdit"
      FROM "agent_messages" a
             JOIN "messages" m ON a."id" = m."agentMessageId"
             LEFT JOIN "messages" parent ON m."parentId" = parent."id"
             LEFT JOIN "user_messages" um ON um."id" = parent."userMessageId"
             LEFT JOIN "users" u ON um."userId" = u."id"
             JOIN "agent_configurations" ac ON a."agentConfigurationId" = ac."sId"
             JOIN "users" aut ON ac."authorId" = aut."id"
      WHERE a."status" = 'succeeded'
        AND a."createdAt" BETWEEN :startDate AND :endDate
        AND ac."workspaceId" = :wId
        AND ac."status" = 'active'
        AND ac."scope" != 'hidden'
      GROUP BY
        ac."name",
        ac."description",
        ac."scope",
        ac."modelId",
        ac."providerId"
      ORDER BY
        "messages" DESC;
    `,
    {
      type: QueryTypes.SELECT,
      replacements: {
        startDate: format(startDate, "yyyy-MM-dd'T'00:00:00"), // Use first day of start month
        endDate: format(endDate, "yyyy-MM-dd'T'23:59:59"), // Use last day of end month
        wId,
      },
    }
  );
  if (!mentions.length) {
    return "No data available for the selected period.";
  }
  return generateCsvFromQueryResult(mentions);
}

export async function getFeedbackUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType
): Promise<string> {
  const feedbacks = await getFrontReplicaDbConnection().transaction(
    async (t) => {
      return AgentMessageFeedbackResource.getFeedbackUsageDataForWorkspace({
        startDate,
        endDate,
        workspace,
        transaction: t,
      });
    }
  );

  if (feedbacks.length === 0) {
    return "No data available for the selected period.";
  }

  const feedbacksWithMinimalFields = feedbacks.map((feedback) => {
    const jsonFeedback = feedback.toJSON();
    return {
      id: jsonFeedback.id,
      createdAt: jsonFeedback.createdAt,
      userName: jsonFeedback.userName,
      userEmail: jsonFeedback.userEmail,
      agentConfigurationId: jsonFeedback.agentConfigurationId,
      agentConfigurationVersion: jsonFeedback.agentConfigurationVersion,
      thumb: jsonFeedback.thumbDirection,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      content: jsonFeedback.content?.replace(/\r?\n/g, "\\n") || null,
      conversationUrl:
        jsonFeedback.conversationId && jsonFeedback.isConversationShared
          ? reconstructConversationUrl(workspace, jsonFeedback.conversationId)
          : null,
    } as FeedbackQueryResult;
  });
  return generateCsvFromQueryResult(feedbacksWithMinimalFields);
}

function reconstructConversationUrl(
  workspace: WorkspaceType,
  conversationId: string
) {
  return getAgentRoute(
    workspace.sId,
    conversationId,
    config.getClientFacingUrl()
  );
}

function generateCsvFromQueryResult(
  rows:
    | WorkspaceUsageQueryResult[]
    | UserUsageQueryResult[]
    | AgentUsageQueryResult[]
    | MessageUsageQueryResult[]
    | BuilderUsageQueryResult[]
    | FeedbackQueryResult[]
    | GroupMembershipQueryResult[]
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
 *   - Existence of a custom agent
 *   - A conversation occurred within the past 7 days
 */
export async function checkWorkspaceActivity(auth: Authenticator) {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const hasDataSource =
    (await DataSourceResource.listByWorkspace(auth, { limit: 1 })).length > 0;

  const hasCreatedAssistant = await AgentConfiguration.findOne({
    where: { workspaceId: auth.getNonNullableWorkspace().id },
  });

  // INFO: keep accessing the model for now to avoid circular deps warning
  const owner = auth.getNonNullableWorkspace();
  const hasRecentConversation = await ConversationModel.findAll({
    where: {
      workspaceId: owner.id,
      updatedAt: { [Op.gte]: sevenDaysAgo },
    },
  });

  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  return hasDataSource || hasCreatedAssistant || hasRecentConversation;
}
