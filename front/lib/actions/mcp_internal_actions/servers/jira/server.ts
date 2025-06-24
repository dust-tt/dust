import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CreateIssueRequest } from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import {
  addComment,
  createIssue,
  getTicket,
  getTransitions,
  searchTickets,
  transitionIssue,
  updateIssue,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import {
  ERROR_MESSAGES,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_utils";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "jira",
  version: "2.0.0",
  description:
    "Comprehensive JIRA integration providing full ticket management capabilities including create, read, update, comment, and workflow transition operations using the JIRA REST API.",
  authorization: {
    provider: "jira" as const,
    supported_use_cases: ["platform_actions", "personal_actions"] as const,
  },
  icon: "JiraLogo",
  documentationUrl:
    "https://developer.atlassian.com/server/jira/platform/rest/v10007/intro/",
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "get_tickets",
    "Retrieves a single JIRA ticket by its key (e.g., 'PROJ-123').",
    {
      ticketKey: z.string().describe("The JIRA ticket key (e.g., 'PROJ-123')"),
    },
    async ({ ticketKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const ticket = await getTicket(baseUrl, accessToken, ticketKey);
          if (!ticket) {
            return makeMCPToolTextError(ERROR_MESSAGES.TICKET_NOT_FOUND);
          }
          return makeMCPToolJSONSuccess({
            message: "Ticket retrieved successfully",
            result: ticket,
          });
        },
        authInfo,
        params: { ticketKey },
      });
    }
  );

  server.tool(
    "list_tickets",
    "Lists JIRA tickets based on a JQL query. Returns a paginated list of tickets.",
    {
      jql: z
        .string()
        .optional()
        .describe(
          "JQL query to filter tickets (e.g., 'project = PROJ AND status = Open')"
        ),
      startAt: z
        .number()
        .optional()
        .describe("Starting index for pagination (default: 0)"),
      maxResults: z
        .number()
        .optional()
        .describe("Maximum number of results to return (default: 50)"),
    },
    async ({ jql, startAt, maxResults }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchTickets(
            baseUrl,
            accessToken,
            jql,
            startAt,
            maxResults
          );
          return makeMCPToolJSONSuccess({
            message: "Tickets retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { jql, startAt, maxResults },
      });
    }
  );

  server.tool(
    "create_issue",
    "Creates a new JIRA issue with the specified details.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
      summary: z.string().describe("Brief summary of the issue"),
      description: z
        .string()
        .optional()
        .describe("Detailed description of the issue"),
      issueType: z
        .string()
        .describe("Issue type (e.g., 'Bug', 'Task', 'Story')"),
      priority: z
        .string()
        .optional()
        .describe("Priority (e.g., 'High', 'Medium', 'Low')"),
      assigneeAccountId: z
        .string()
        .optional()
        .describe("Account ID of the assignee"),
      labels: z
        .array(z.string())
        .optional()
        .describe("Array of labels to add to the issue"),
    },
    async (
      {
        projectKey,
        summary,
        description,
        issueType,
        priority,
        assigneeAccountId,
        labels,
      },
      { authInfo }
    ) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const issueData: CreateIssueRequest = {
            project: { key: projectKey },
            summary,
            issuetype: { name: issueType },
          };

          if (description) {
            issueData.description = description;
          }
          if (priority) {
            issueData.priority = { name: priority };
          }
          if (assigneeAccountId) {
            issueData.assignee = { accountId: assigneeAccountId };
          }
          if (labels) {
            issueData.labels = labels;
          }

          const result = await createIssue(baseUrl, accessToken, issueData);
          return makeMCPToolJSONSuccess({
            message: "Issue created successfully",
            result,
          });
        },
        authInfo,
        params: { projectKey, summary, issueType },
      });
    }
  );

  server.tool(
    "update_issue",
    "Updates an existing JIRA issue with new field values.",
    {
      ticketKey: z.string().describe("The JIRA ticket key (e.g., 'PROJ-123')"),
      summary: z.string().optional().describe("Updated summary of the issue"),
      description: z
        .string()
        .optional()
        .describe("Updated description of the issue"),
      priority: z
        .string()
        .optional()
        .describe("Updated priority (e.g., 'High', 'Medium', 'Low')"),
      assigneeAccountId: z
        .string()
        .optional()
        .describe("Account ID of the new assignee"),
      labels: z
        .array(z.string())
        .optional()
        .describe("Updated array of labels"),
    },
    async (
      { ticketKey, summary, description, priority, assigneeAccountId, labels },
      { authInfo }
    ) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const updateData: Partial<CreateIssueRequest> = {};

          if (summary) {
            updateData.summary = summary;
          }
          if (description) {
            updateData.description = description;
          }
          if (priority) {
            updateData.priority = { name: priority };
          }
          if (assigneeAccountId) {
            updateData.assignee = { accountId: assigneeAccountId };
          }
          if (labels) {
            updateData.labels = labels;
          }

          await updateIssue(baseUrl, accessToken, ticketKey, updateData);
          return makeMCPToolJSONSuccess({
            message: "Issue updated successfully",
            result: { ticketKey, updatedFields: Object.keys(updateData) },
          });
        },
        authInfo,
        params: { ticketKey },
      });
    }
  );

  server.tool(
    "add_comment",
    "Adds a comment to an existing JIRA issue.",
    {
      ticketKey: z.string().describe("The JIRA ticket key (e.g., 'PROJ-123')"),
      comment: z.string().describe("The comment text to add"),
      visibilityType: z
        .enum(["group", "role"])
        .optional()
        .describe("Visibility restriction type"),
      visibilityValue: z
        .string()
        .optional()
        .describe("Group or role name for visibility restriction"),
    },
    async (
      { ticketKey, comment, visibilityType, visibilityValue },
      { authInfo }
    ) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const visibility =
            visibilityType && visibilityValue
              ? { type: visibilityType, value: visibilityValue }
              : undefined;

          const result = await addComment(
            baseUrl,
            accessToken,
            ticketKey,
            comment,
            visibility
          );
          return makeMCPToolJSONSuccess({
            message: "Comment added successfully",
            result,
          });
        },
        authInfo,
        params: { ticketKey },
      });
    }
  );

  server.tool(
    "transition_issue",
    "Transitions a JIRA issue to a different status/workflow state.",
    {
      ticketKey: z.string().describe("The JIRA ticket key (e.g., 'PROJ-123')"),
      transitionId: z.string().describe("The ID of the transition to perform"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment to add during transition"),
    },
    async ({ ticketKey, transitionId, comment }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          await transitionIssue(
            baseUrl,
            accessToken,
            ticketKey,
            transitionId,
            comment
          );
          return makeMCPToolJSONSuccess({
            message: "Issue transitioned successfully",
            result: {
              ticketKey,
              transitionId,
              ...(comment && { comment }),
            },
          });
        },
        authInfo,
        params: { ticketKey, transitionId },
      });
    }
  );

  server.tool(
    "get_transitions",
    "Gets available transitions for a JIRA issue based on its current status and workflow.",
    {
      ticketKey: z.string().describe("The JIRA ticket key (e.g., 'PROJ-123')"),
    },
    async ({ ticketKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getTransitions(baseUrl, accessToken, ticketKey);
          return makeMCPToolJSONSuccess({
            message: "Transitions retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { ticketKey },
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
