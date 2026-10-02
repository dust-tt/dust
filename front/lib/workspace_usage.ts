import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { sanitizeCsvCell } from "@app/lib/api/analytics/csv_utils";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { getFrontReplicaDbConnection } from "@app/lib/resources/storage";
import { GroupMembershipModel } from "@app/lib/resources/storage/models/group_memberships";
import { GroupModel } from "@app/lib/resources/storage/models/groups";
import { CAP_ELIGIBLE_GROUP_KINDS } from "@app/types/groups";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import { stringify } from "csv-stringify/sync";
import { format } from "date-fns/format";
import { Op, QueryTypes } from "sequelize";

interface WorkspaceUsageQueryResult {
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
  conversation_id: number;
  parent_message_id: number | null;
  user_message_id: number | null;
  user_id: number | null;
  user_email: string | null;
  source: string | null;
}

type UserUsageQueryResult = {
  userId: string;
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
  distinctConversations: number;
  lastEdit: Date;
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

  // biome-ignore lint/plugin/noRawSql: Leggit
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
                [Op.in]: [...CAP_ELIGIBLE_GROUP_KINDS],
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

export async function getAgentUsageData(
  startDate: Date,
  endDate: Date,
  workspace: WorkspaceType,
  agent: AgentResource
): Promise<number> {
  const wId = workspace.id;
  const readReplica = getFrontReplicaDbConnection();
  // biome-ignore lint/plugin/noRawSql: Leggit
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
        agentConfigurationId: agent.sId,
        wId,
      },
    }
  );

  if (!mentions.length) {
    return 0;
  }
  return mentions[0].messages;
}

/**
 * @cc [owner:sfriquet,label:security] sanitized-csv-cells
 * Every string cell MUST pass through `sanitizeCsvCell` before serialization, so values starting
 * with `=`, `+`, `-` or `@` are not interpreted as formulas by spreadsheet apps.
 */
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
  const data = rows.map((row) =>
    Object.values(row).map((value) =>
      typeof value === "string" ? sanitizeCsvCell(value) : value
    )
  );

  return stringify([headers, ...data], {
    header: false,
    cast: {
      date: (value) => value.toISOString(),
    },
  });
}
