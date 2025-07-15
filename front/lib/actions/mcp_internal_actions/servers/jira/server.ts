import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { CreateIssueRequest } from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import {
  addComment,
  createIssue,
  getIssue,
  getIssueFields,
  getIssueTypes,
  getProject,
  getProjects,
  getTransitions,
  getUserInfo,
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

// Helper function to escape JQL values that contain spaces or special characters
const escapeJQLValue = (value: string): string => {
  // If the value contains spaces, special characters, or reserved words, wrap it in quotes
  if (
    /[\s"'\\]/.test(value) ||
    /^(and|or|not|in|is|was|from|to|on|by|during|before|after|empty|null|order|asc|desc|changed|was|in|not|to|from|by|before|after|on|during)$/i.test(
      value
    )
  ) {
    // Escape any existing quotes in the value
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
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
    "get_projects",
    "Retrieves a list of JIRA projects.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getProjects(baseUrl, accessToken);
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Projects retrieved successfully",
            result,
          });
        },
        authInfo,
        params: {},
      });
    }
  );

  server.tool(
    "get_issues_by_assignee",
    "Get issues by assignee.",
    {
      assigneeAccountId: z.string().describe("The JIRA assignee account ID"),
    },
    async ({ assigneeAccountId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(
            baseUrl,
            accessToken,
            `assignee = ${escapeJQLValue(assigneeAccountId)}`
          );
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issues retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { assigneeAccountId },
      });
    }
  );

  server.tool(
    "get_issues_by_type",
    "Get issues by type.",
    {
      issueType: z.string().describe("The JIRA issue type"),
    },
    async ({ issueType }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(
            baseUrl,
            accessToken,
            `issueType = ${escapeJQLValue(issueType)}`
          );
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issues retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { issueType },
      });
    }
  );

  server.tool(
    "get_issues_by_parent",
    "Get issues by parent.",
    {
      parentIssueKey: z.string().describe("The JIRA parent issue key"),
    },
    async ({ parentIssueKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(
            baseUrl,
            accessToken,
            `parent = ${escapeJQLValue(parentIssueKey)}`
          );
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issues retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { parentIssueKey },
      });
    }
  );

  server.tool(
    "get_issues_by_status",
    "Get issues by status.",
    {
      status: z.string().describe("The JIRA status name"),
    },
    async ({ status }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(
            baseUrl,
            accessToken,
            `status = ${escapeJQLValue(status)}`
          );
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issues retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { status },
      });
    }
  );

  server.tool(
    "get_issues_by_priority",
    "Get issues by priority.",
    {
      priority: z.string().describe("The JIRA priority name"),
    },
    async ({ priority }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(
            baseUrl,
            accessToken,
            `priority = ${escapeJQLValue(priority)}`
          );
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issues retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { priority },
      });
    }
  );

  server.tool(
    "get_issues_by_project",
    "Get issues by project key.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    async ({ projectKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(
            baseUrl,
            accessToken,
            `project = ${escapeJQLValue(projectKey)}`
          );
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issues retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { projectKey },
      });
    }
  );

  server.tool(
    "get_project",
    "Retrieves a single JIRA project by its key (e.g., 'PROJ').",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    async ({ projectKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getProject(baseUrl, accessToken, projectKey);
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Project retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { projectKey },
      });
    }
  );

  server.tool(
    "get_issueTypes",
    "Retrieves available issue types for a JIRA project.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    async ({ projectKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getIssueTypes(baseUrl, accessToken, projectKey);
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issue types retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { projectKey },
      });
    }
  );

  server.tool(
    "get_issue_fields",
    "Retrieves available fields for creating issues in a JIRA project, optionally filtered by issue type.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
      issueTypeId: z.string().optional().describe("Optional issue type ID to filter fields for a specific issue type"),
    },
    async ({ projectKey, issueTypeId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getIssueFields(baseUrl, accessToken, projectKey, issueTypeId);
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
          return makeMCPToolJSONSuccess({
            message: "Issue fields retrieved successfully",
            result,
          });
        },
        authInfo,
        params: { projectKey, issueTypeId },
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
            issueData.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: description,
                    },
                  ],
                },
              ],
            };
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
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
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
            updateData.description = {
              type: "doc",
              version: 1,
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: description,
                    },
                  ],
                },
              ],
            };
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

          const result = await updateIssue(
            baseUrl,
            accessToken,
            issueKey,
            updateData
          );
          if (result && "error" in result) {
            return makeMCPToolTextError(result.error);
          }
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
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
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
          const result = await transitionIssue(
            baseUrl,
            accessToken,
            issueKey,
            transitionId,
            comment
          );
          if (result && "error" in result) {
            return makeMCPToolTextError(result.error);
          }
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
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }
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

  server.tool(
    "get_jira_user_info",
    "Gets information about the currently authenticated JIRA user.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getUserInfo(baseUrl, accessToken);
          if ("error" in result) {
            return makeMCPToolTextError(result.error);
          }

          // Transform the JIRA API response to match the expected format
          const transformedResult = {
            account_id: result.accountId,
            email: result.emailAddress,
            name: result.displayName,
            picture: result.avatarUrls["48x48"],
            account_status: result.active ? "active" : "inactive",
            characteristics: {
              not_mentionable: false,
            },
            last_updated: new Date().toISOString(),
            nickname: result.displayName,
            locale: result.locale || "en-US",
            extended_profile: {
              phone_numbers: [],
              team_type: "Software Development",
            },
            account_type: result.accountType,
            email_verified: true,
          };

          return makeMCPToolJSONSuccess({
            message: "User information retrieved successfully",
            result: transformedResult,
          });
        },
        authInfo,
        params: {},
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
