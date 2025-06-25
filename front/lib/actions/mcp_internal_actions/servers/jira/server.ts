import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CreateIssueRequest } from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import {
  addComment,
  createIssue,
  getIssue,
  getTransitions,
  searchIssues,
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
    "Comprehensive JIRA integration providing full issue management capabilities including create, read, update, comment, and workflow transition operations using the JIRA REST API.",
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
    "get_issues",
    "Retrieves a single JIRA issue by its key (e.g., 'PROJ-123').",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
    },
    async ({ issueKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const issue = await getIssue(baseUrl, accessToken, issueKey);
          if (!issue) {
            return makeMCPToolTextError(ERROR_MESSAGES.ISSUE_NOT_FOUND);
          }
          return makeMCPToolJSONSuccess({
            message: "Issue retrieved successfully",
            result: issue,
          });
        },
        authInfo,
        params: { issueKey },
      });
    }
  );

  server.tool(
    "list_issues",
    "Lists JIRA issues based on a JQL query. Returns a paginated list of issues.",
    {
      jql: z
        .string()
        .optional()
        .describe(
          "JQL query to filter issues (e.g., 'project = PROJ AND status = Open')"
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
          const result = await searchIssues(
            baseUrl,
            accessToken,
            jql,
            startAt,
            maxResults
          );
          return makeMCPToolJSONSuccess({
            message: "Issues retrieved successfully",
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
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
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
      { issueKey, summary, description, priority, assigneeAccountId, labels },
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

          await updateIssue(baseUrl, accessToken, issueKey, updateData);
          return makeMCPToolJSONSuccess({
            message: "Issue updated successfully",
            result: { issueKey, updatedFields: Object.keys(updateData) },
          });
        },
        authInfo,
        params: { issueKey },
      });
    }
  );

  server.tool(
    "add_comment",
    "Adds a comment to an existing JIRA issue.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
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
      { issueKey, comment, visibilityType, visibilityValue },
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
            issueKey,
            comment,
            visibility
          );
          return makeMCPToolJSONSuccess({
            message: "Comment added successfully",
            result,
          });
        },
        authInfo,
        params: { issueKey },
      });
    }
  );

  server.tool(
    "transition_issue",
    "Transitions a JIRA issue to a different status/workflow state.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      transitionId: z.string().describe("The ID of the transition to perform"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment to add during transition"),
    },
    async ({ issueKey, transitionId, comment }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          await transitionIssue(
            baseUrl,
            accessToken,
            issueKey,
            transitionId,
            comment
          );
          return makeMCPToolJSONSuccess({
            message: "Issue transitioned successfully",
            result: {
              issueKey,
              transitionId,
              ...(comment && { comment }),
            },
          });
        },
        authInfo,
        params: { issueKey, transitionId },
      });
    }
  );

  server.tool(
    "get_transitions",
    "Gets available transitions for a JIRA issue based on its current status and workflow.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
    },
    async ({ issueKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getTransitions(baseUrl, accessToken, issueKey);
          return makeMCPToolJSONSuccess({
            message: "Transitions retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { issueKey },
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
