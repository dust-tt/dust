import config from "@app/lib/api/config";
import { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { LabsConnectionsConfigurationResource } from "@app/lib/resources/labs_connections_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { FreshServiceClient } from "@app/temporal/labs/connections/providers/freshservice/client";
import type {
  Asset,
  Change,
  Conversation,
  Problem,
  SlaPolicy,
  Task,
  Ticket,
} from "@app/temporal/labs/connections/providers/freshservice/types";
import {
  markSyncCompleted,
  markSyncFailed,
  markSyncStarted,
} from "@app/temporal/labs/connections/utils";
import type { ModelId, Result } from "@app/types";
import { Err, isFreshServiceCredentials, OAuthAPI, Ok } from "@app/types";
import { CoreAPI, dustManagedCredentials } from "@app/types";

const FRESH_SERVICE_STATUS_MAP = ["Open", "Pending", "Resolved", "Closed"];
const FRESH_SERVICE_SOURCE_MAP = [
  "Email",
  "Portal",
  "Phone",
  "Chat",
  "Feedback widget",
  "Yammer",
  "AWS Cloudwatch",
  "Pagerduty",
  "Walkup",
  "Slack",
];

interface Section {
  prefix: string;
  content: string;
  sections: Section[];
}

function convertEntityAttribute(key: string, value: unknown): unknown {
  // Freshservice uses numeric values to represent many attributes.
  // This function converts those numeric values to their string equivalents.
  const priorityMap = ["Low", "Medium", "High", "Urgent"];
  const riskMap = ["Low", "Medium", "High", "Very High"];
  const changeTypeMap = ["Minor", "Standard", "Major", "Emergency"];

  if (key === "priority" || key === "impact") {
    return priorityMap[(value as number) - 1] || "Unknown";
  }
  if (key === "status") {
    return FRESH_SERVICE_STATUS_MAP[(value as number) - 2] || "Unknown";
  }
  if (key === "source") {
    return FRESH_SERVICE_SOURCE_MAP[(value as number) - 1] || "Unknown";
  }
  if (key === "risk") {
    return riskMap[(value as number) - 1] || "Unknown";
  }
  if (key === "change_type") {
    return changeTypeMap[(value as number) - 1] || "Unknown";
  }

  if (typeof value === "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return value;
}

function createTicketSection(ticket: Ticket, documentId: string): Section {
  const content = Object.entries(ticket)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${convertEntityAttribute(key, value)}`)
    .join("\n");

  return {
    prefix: `${documentId}-ticket-${ticket.id}`,
    content: content,
    sections: [],
  };
}

function createTicketTaskSection(task: Task, documentId: string): Section {
  const content = Object.entries(task)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${convertEntityAttribute(key, value)}`)
    .join("\n");
  return {
    prefix: `${documentId}-task-${task.id}`,
    content: content,
    sections: [],
  };
}

function createConversationSection(
  conversation: Conversation,
  documentId: string
): Section {
  const content = Object.entries(conversation)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${convertEntityAttribute(key, value)}`)
    .join("\n");

  return {
    prefix: `${documentId}-conversation-${conversation.id}`,
    content: content,
    sections: [],
  };
}

function createProblemSection(problem: Problem, documentId: string): Section {
  const content = Object.entries(problem)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${convertEntityAttribute(key, value)}`)
    .join("\n");

  return {
    prefix: `${documentId}-problem-${problem.id}`,
    content: content,
    sections: [],
  };
}

function createChangeSection(change: Change, documentId: string): Section {
  const content = Object.entries(change)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${convertEntityAttribute(key, value)}`)
    .join("\n");

  return {
    prefix: `${documentId}-change-${change.id}`,
    content: content,
    sections: [],
  };
}

function createAssetSection(asset: Asset, documentId: string): Section {
  const content = Object.entries(asset)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${convertEntityAttribute(key, value)}`)
    .join("\n");

  return {
    prefix: `${documentId}-asset-${asset.id}`,
    content: content,
    sections: [],
  };
}

function createSlaPolicySection(
  policy: SlaPolicy,
  documentId: string
): Section {
  const content = Object.entries(policy)
    .filter(([_, value]) => value)
    .map(([key, value]) => `${key}: ${convertEntityAttribute(key, value)}`)
    .join("\n");

  return {
    prefix: `${documentId}-sla-${policy.id}`,
    content: content,
    sections: [],
  };
}

function createTicketDocument(
  documentId: string,
  ticket: Ticket,
  conversations: Conversation[],
  tasks: Task[],
  problem: Problem | null,
  changes: Change[],
  assets: Asset[]
): Section {
  const content = `Ticket: ${ticket.subject || "Untitled"}\n`;

  const sections: Section[] = [
    {
      prefix: `${documentId}-details`,
      content: createTicketSection(ticket, documentId).content,
      sections: [],
    },
  ];

  if (conversations.length > 0) {
    sections.push({
      prefix: `${documentId}-conversations`,
      content: "Conversations:\n",
      sections: conversations.map((conversation) =>
        createConversationSection(conversation, documentId)
      ),
    });
  }

  if (tasks.length > 0) {
    sections.push({
      prefix: `${documentId}-tasks`,
      content: "Tasks:\n",
      sections: tasks.map((task) => createTicketTaskSection(task, documentId)),
    });
  }

  if (problem) {
    sections.push({
      prefix: `${documentId}-problem`,
      content: "Problem:\n",
      sections: [createProblemSection(problem, documentId)],
    });
  }

  if (changes.length > 0) {
    sections.push({
      prefix: `${documentId}-changes`,
      content: "Changes:\n",
      sections: changes.map((change) =>
        createChangeSection(change, documentId)
      ),
    });
  }

  if (assets.length > 0) {
    sections.push({
      prefix: `${documentId}-assets`,
      content: "Assets:\n",
      sections: assets.map((asset) => createAssetSection(asset, documentId)),
    });
  }
  return {
    prefix: documentId,
    content,
    sections,
  };
}

function createTicketTags(ticket: Ticket): string[] {
  const baseTags = ["freshservice"];
  const ticketTags = [
    ticket.status && `status:${FRESH_SERVICE_STATUS_MAP[ticket.status - 2]}`,
    ticket.source && `source:${FRESH_SERVICE_SOURCE_MAP[ticket.source - 1]}`,
    ticket.department_id && `department_id:${ticket.department_id}`,
    ticket.type && `type:${ticket.type}`,
    ticket.category && `category:${ticket.category}`,
    ticket.workspace_id && `workspace_id:${ticket.workspace_id}`,
  ].filter((tag): tag is string => Boolean(tag));

  return [...baseTags, ...ticketTags];
}

async function upsertToDustDatasource(
  coreAPI: CoreAPI,
  workspaceId: string,
  dataSourceViewId: ModelId,
  documentId: string,
  section: Section,
  tags: string[],
  title: string,
  sourceUrl?: string
): Promise<void> {
  try {
    const user = await UserResource.fetchByModelId(workspaceId);

    if (!user) {
      logger.error({ workspaceId }, "User not found");
      return;
    }

    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspaceId
    );

    const [datasourceView] = await DataSourceViewResource.fetchByModelIds(
      auth,
      [dataSourceViewId]
    );

    if (!datasourceView) {
      logger.error({ dataSourceViewId }, "No datasource view found. Stopping.");
      return;
    }

    const dataSource = datasourceView.dataSource;

    if (!dataSource) {
      logger.error({ dataSourceViewId }, "No datasource found. Stopping.");
      return;
    }

    const upsertRes = await coreAPI.upsertDataSourceDocument({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      documentId: documentId,
      tags,
      parentId: null,
      parents: [documentId],
      sourceUrl,
      timestamp: null,
      section,
      credentials: dustManagedCredentials(),
      lightDocumentOutput: true,
      title,
      mimeType: "text/plain",
    });

    if (upsertRes.isErr()) {
      logger.error(
        { error: upsertRes.error, documentId },
        "Error upserting document to Dust datasource"
      );
      return;
    }

    logger.info(
      { documentId },
      "Upserted Freshservice document to Dust datasource"
    );
  } catch (error) {
    logger.error(
      { error, documentId },
      "Error upserting document to Dust datasource"
    );
  }
}

async function paginateAll<T>(
  clientMethod: (page: number, perPage: number) => Promise<any>,
  extractItems: (response: any) => T[],
  hasMorePages: (response: any) => boolean = (response) => !!response.page,
  pageSize: number = 100
): Promise<T[]> {
  let page = 1;
  let allItems: T[] = [];

  while (true) {
    logger.info({ page, pageSize }, `Fetching page ${page}`);
    const response = await clientMethod(page, pageSize);

    const items = extractItems(response);

    if (!items || items.length === 0) {
      break;
    }

    allItems = [...allItems, ...items];

    if (!hasMorePages(response)) {
      break;
    }

    page++;
  }

  logger.info({ totalItems: allItems.length }, "Finished fetching all pages");
  return allItems;
}

export async function syncFreshServiceConnection(
  configuration: LabsConnectionsConfigurationResource,
  cursor: string | null = null
): Promise<Result<void, Error>> {
  const isFullSync = cursor === null;
  try {
    await markSyncStarted(configuration);

    const credentialId = configuration.credentialId;
    if (!credentialId) {
      await markSyncFailed(configuration, "No credentials found");
      return new Err(new Error("No credentials found"));
    }

    const dataSourceViewId = configuration.dataSourceViewId;
    if (!dataSourceViewId) {
      await markSyncFailed(configuration, "No data source view found");
      return new Err(new Error("No data source view found"));
    }

    const workspaceId = configuration.workspaceId;
    if (!workspaceId) {
      await markSyncFailed(configuration, "No workspace ID found");
      return new Err(new Error("No workspace ID found"));
    }

    const oauthApi = new OAuthAPI(config.getOAuthAPIConfig(), logger);

    const credentialsRes = await oauthApi.getCredentials({
      credentialsId: credentialId,
    });

    if (credentialsRes.isErr()) {
      const errorMsg = "Error fetching credentials from OAuth API";
      logger.error({ error: credentialsRes.error }, errorMsg);
      await markSyncFailed(configuration, errorMsg);
      return new Err(new Error("Failed to fetch credentials"));
    }

    if (!isFreshServiceCredentials(credentialsRes.value.credential.content)) {
      const errorMsg =
        "Invalid credentials type - expected FreshService credentials";
      await markSyncFailed(configuration, errorMsg);
      return new Err(new Error(errorMsg));
    }

    const credentials = credentialsRes.value.credential.content;
    const client = new FreshServiceClient(
      credentials.api_key,
      credentials.domain
    );
    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

    let since = isFullSync ? null : new Date(cursor);
    // subtract one week from the since date
    since = since ? new Date(since.getTime() - 7 * 24 * 60 * 60 * 1000) : null;

    // Test the credentials
    const testResult = await client.testCredentials();
    if (testResult.isErr()) {
      const errorMsg = "FreshService credentials test failed";
      await markSyncFailed(configuration, errorMsg);
      return testResult;
    }

    const tickets = await paginateAll<Ticket>(
      (page, perPage) => client.getTickets(page, perPage, since?.toISOString()),
      (response) => response.tickets || []
    );

    await concurrentExecutor(
      tickets,
      async (listedTicket: Ticket) => {
        try {
          const ticket = await client.getTicket(listedTicket.id);

          const conversations = await paginateAll<Conversation>(
            (page, perPage) =>
              client.getConversations(ticket.id, page, perPage),
            (response) => response.conversations || []
          );

          const tasks = await paginateAll<Task>(
            (page, perPage) => client.getTicketTasks(ticket.id, page, perPage),
            (response) => response.tasks || []
          );

          const problem = ticket.problem?.display_id
            ? await client.getProblem(ticket.problem.display_id)
            : null;
          const changes = await Promise.all(
            [
              ...(ticket.changes_initiated_by_ticket || []),
              ...(ticket.changes_initiating_ticket || []),
            ]
              .map((change) =>
                change.display_id ? client.getChange(change.display_id) : null
              )
              .filter((change) => change !== null)
          );
          const assets = ticket.assets
            ? await Promise.all(
                ticket.assets
                  .map((asset) =>
                    asset.display_id ? client.getAsset(asset.display_id) : null
                  )
                  .filter((asset) => asset !== null)
              )
            : [];

          const documentId = `freshservice-ticket-${ticket.id}`;
          const section = createTicketDocument(
            documentId,
            ticket,
            conversations,
            tasks,
            problem,
            changes,
            assets
          );

          const tags = createTicketTags(ticket);
          const sourceUrl = `${client.baseURL}/a/tickets/${ticket.id}`;

          await upsertToDustDatasource(
            coreAPI,
            workspaceId.toString(),
            dataSourceViewId,
            documentId,
            section,
            tags,
            ticket.subject || ticket.id.toString(),
            sourceUrl
          );
        } catch (error) {
          logger.error(
            { ticketId: listedTicket.id, error },
            "Failed to upsert ticket document"
          );
        }
      },
      { concurrency: 5 }
    );

    const slaPolicies = await paginateAll<SlaPolicy>(
      (page, perPage) => client.getSlaPolicies(page, perPage),
      (response) => response.sla_policies || []
    );

    await concurrentExecutor(
      slaPolicies,
      async (slaPolicy: SlaPolicy) => {
        const documentId = `freshservice-sla-${slaPolicy.id}`;
        const section = createSlaPolicySection(slaPolicy, documentId);

        const sourceUrl = `${client.baseURL}/a/sla_policies/${slaPolicy.id}`;

        await upsertToDustDatasource(
          coreAPI,
          workspaceId.toString(),
          dataSourceViewId,
          documentId,
          section,
          [],
          slaPolicy.name || slaPolicy.id.toString(),
          sourceUrl
        );
      },
      { concurrency: 5 }
    );

    await markSyncCompleted(configuration);
    return new Ok(undefined);
  } catch (error) {
    await markSyncFailed(
      configuration,
      error instanceof Error ? error.message : String(error)
    );
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}
