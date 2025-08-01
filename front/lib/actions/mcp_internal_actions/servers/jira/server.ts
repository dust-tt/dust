import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  createComment,
  createIssue,
  createIssueLink,
  deleteIssueLink,
  getConnectionInfo,
  getIssue,
  getIssueFields,
  getIssueLinkTypes,
  getIssueTypes,
  getProject,
  getProjects,
  getTransitions,
  searchIssues,
  transitionIssue,
  updateIssue,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import {
  JiraCreateIssueLinkRequestSchema,
  JiraCreateIssueRequestSchema,
  JiraSearchFilterSchema,
  JiraSortSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";

const serverInfo: InternalMCPServerDefinitionType = {
  name: "jira",
  version: "1.0.0",
  description:
    "Comprehensive JIRA integration providing full issue management capabilities including create, read, update, comment, workflow transitions, and issue linking operations using the JIRA REST API.",
  authorization: {
    provider: "jira" as const,
    supported_use_cases: ["platform_actions", "personal_actions"] as const,
  },
  icon: "JiraLogo",
  documentationUrl: null,
};

const createServer = (): McpServer => {
  const server = new McpServer(serverInfo, {
    instructions: `
      You have access to the following tools: get_issue, get_projects, get_project, get_transitions, create_comment, get_issues, get_issue_types, get_issue_fields, get_connection_info, transition_issue, create_issue, update_issue, create_issue_link, delete_issue_link, get_issue_link_types.

      # General Workflow for JIRA Data:
      0.  **Authenticate:** Use \`get_connection_info\` to authenticate with JIRA if you are not authenticated ("No access token found").
      1.  **Describe Object:** Use \`get_issue_types\` and \`get_issue_fields\` with the specific issue typename to get its detailed metadata. This will show you all available fields, their exact names, data types, and information about relationships (child relationships are particularly important for subqueries).
      3.  **Execute Read Query:** Use \`get_issues\` to retrieve data using JQL. Construct your JQL queries based on the information obtained from \`get_issue_types\` to ensure you are using correct field and relationship names.

      **Best Practices for Querying:**
      1.  **Discover Object Structure First:** Use \`get_issue_fields\` to understand an object's fields and relationships before writing complex queries. Alternatively, for a quick field list directly in a query, use \`get_issues\` .
      2.  **Verify Field and Relationship Names:** If you encounter JIRA 400 errors suggesting that the field or relationship does not exist, use \`get_issue_types\` for the relevant object(s) to confirm the exact names and their availability.
    `,
  });

  server.tool(
    "get_issue",
    "Retrieves a single JIRA issue by its key (e.g., 'PROJ-123').",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
    },
    async ({ issueKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const issue = await getIssue({
            baseUrl,
            accessToken,
            issueKey,
          });
          if (issue.isOk() && issue.value === null) {
            return makeMCPToolJSONSuccess({
              message: "No issue found with the specified key",
              result: { found: false, issueKey },
            });
          }
          if (issue.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving issue: ${issue.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Issue retrieved successfully",
            result: { issue: issue.value },
          });
        },
        authInfo,
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
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving projects: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Projects retrieved successfully",
            result,
          });
        },
        authInfo,
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
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving project: ${result.error}`
            );
          }
          if (result.value === null) {
            return makeMCPToolTextError(
              `No project found with the specified key: ${projectKey}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Project retrieved successfully",
            result: result.value,
          });
        },
        authInfo,
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
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving transitions: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Transitions retrieved successfully",
            result,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_comment",
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

          const result = await createComment(
            baseUrl,
            accessToken,
            issueKey,
            comment,
            visibility
          );
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error adding comment: ${result.error}`
            );
          }
          if (result.value === null) {
            return makeMCPToolJSONSuccess({
              message: "Issue not found or no permission to add comment",
              result: { found: false, issueKey },
            });
          }
          return makeMCPToolJSONSuccess({
            message: "Comment added successfully",
            result: {
              issueKey,
              comment,
              commentId: result.value.id,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_issues",
    "Search issues using one or more filters (e.g., status, priority, labels, assignee, customField, dueDate, created, resolved). Use exact matching by default, or fuzzy matching for approximate/partial matches on summary field. For custom fields, use field 'customField' with customFieldName parameter. For date fields (dueDate, created, resolved), use operator parameter with '<', '>', '=', etc. and date format '2023-07-03' or relative '-25d', '7d', '2w', '1M', etc. Results can be sorted using the sortBy parameter with field and direction (ASC/DESC). When referring to the user, use the get_connection_info tool. When referring to unknown fields, use the get_issue_fields or get_issue_types tool to discover the field names.",
    {
      filters: z
        .array(JiraSearchFilterSchema)
        .min(1)
        .describe("Array of search filters to apply (all must match)"),
      sortBy: JiraSortSchema.optional().describe(
        "Optional sorting configuration for results"
      ),
      nextPageToken: z
        .string()
        .optional()
        .describe("Token for next page of results (for pagination)"),
    },
    async ({ filters, sortBy, nextPageToken }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await searchIssues(baseUrl, accessToken, filters, {
            nextPageToken,
            sortBy,
          });
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error searching issues: ${result.error}`
            );
          }
          const message =
            result.value.issues.length === 0
              ? "No issues found matching the search criteria"
              : "Issues retrieved successfully";
          return makeMCPToolJSONSuccess({
            message,
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_issue_types",
    "Retrieves available issue types for a JIRA project.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
    },
    async ({ projectKey }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          try {
            const result = await getIssueTypes(
              baseUrl,
              accessToken,
              projectKey
            );
            if (result.isErr()) {
              return makeMCPToolTextError(
                `Error retrieving issue types: ${result.error}`
              );
            }
            return makeMCPToolJSONSuccess({
              message: "Issue types retrieved successfully",
              result,
            });
          } catch (error) {
            return makeMCPToolTextError(
              `Error retrieving issue types: ${error}`
            );
          }
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_issue_fields",
    "Retrieves available fields for creating issues in a JIRA project for a specific issue type. Use get_issue_types to get the issue type ID.",
    {
      projectKey: z.string().describe("The JIRA project key (e.g., 'PROJ')"),
      issueTypeId: z
        .string()
        .describe("The issue type ID to get fields for (required)"),
    },
    async ({ projectKey, issueTypeId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          try {
            const result = await getIssueFields(
              baseUrl,
              accessToken,
              projectKey,
              issueTypeId
            );
            if (result.isErr()) {
              return makeMCPToolTextError(
                `Error retrieving issue fields: ${result.error}`
              );
            }
            return makeMCPToolJSONSuccess({
              message: "Issue fields retrieved successfully",
              result,
            });
          } catch (error) {
            return makeMCPToolTextError(
              `Error retrieving issue fields: ${error}`
            );
          }
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_connection_info",
    "Gets comprehensive connection information including user details, cloud ID, and site URL for the currently authenticated JIRA instance. This tool is used when the user is referring about themselves",
    {},
    async (_, { authInfo }) => {
      const accessToken = authInfo?.token;
      if (!accessToken) {
        return makeMCPToolTextError("No access token found");
      }

      const connectionInfo = await getConnectionInfo(accessToken);
      if (connectionInfo.isErr()) {
        return makeMCPToolTextError(
          `Failed to retrieve connection information: ${connectionInfo.error}`
        );
      }

      return makeMCPToolJSONSuccess({
        message: "Connection information retrieved successfully",
        result: connectionInfo,
      });
    }
  );

  server.tool(
    "transition_issue",
    "Transitions a JIRA issue to a different status/workflow state.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      transitionId: z.string().describe("The ID of the transition to perform"),
    },
    async ({ issueKey, transitionId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await transitionIssue(
            baseUrl,
            accessToken,
            issueKey,
            transitionId
          );
          if (result.isErr()) {
            // Provide more helpful error messages for transition issues
            let errorMessage = `Error transitioning issue: ${result.error}`;
            if (
              result.error.includes("transition") &&
              (result.error.includes("not valid") ||
                result.error.includes("not allowed"))
            ) {
              errorMessage = `Transition failed: ${result.error}. This transition may not be available from the current status, or you may lack permission to perform it.`;
            } else if (result.error.includes("workflow")) {
              errorMessage = `Workflow error: ${result.error}. The issue's workflow may have conditions or validators preventing this transition.`;
            }
            return makeMCPToolTextError(errorMessage);
          }
          if (result.value === null) {
            return makeMCPToolJSONSuccess({
              message: "Issue not found or no permission to transition it",
              result: { found: false, issueKey },
            });
          }
          return makeMCPToolJSONSuccess({
            message: "Issue transitioned successfully",
            result: {
              issueKey,
              transitionId,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_issue",
    "Creates a new JIRA issue with the specified details. Note: Available fields vary by project and issue type. Use get_issue_fields to check which fields are required and available.",
    {
      issueData: JiraCreateIssueRequestSchema.describe(
        "The description of the issue"
      ),
    },
    async ({ issueData }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await createIssue(baseUrl, accessToken, issueData);
          if (result.isErr()) {
            let errorMessage = `Error creating issue: ${result.error}`;
            if (
              result.error.includes("cannot be set") ||
              result.error.includes("not on the appropriate screen")
            ) {
              errorMessage = `Field configuration error: ${result.error}. Some fields are not available for this project/issue type. Use get_issue_fields to check which fields are required and available before creating issues.`;
            }
            return makeMCPToolTextError(errorMessage);
          }
          return makeMCPToolJSONSuccess({
            message: "Issue created successfully",
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "update_issue",
    "Updates an existing JIRA issue with new field values (e.g., summary, description, priority, assignee). Note: Issue links, attachments, and some system fields require separate APIs and are not supported.",
    {
      issueKey: z.string().describe("The JIRA issue key (e.g., 'PROJ-123')"),
      updateData: JiraCreateIssueRequestSchema.partial().describe(
        "The partial data to update the issue with"
      ),
    },
    async ({ issueKey, updateData }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await updateIssue(
            baseUrl,
            accessToken,
            issueKey,
            updateData
          );
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error updating issue: ${result.error}`
            );
          }
          if (result.value === null) {
            return makeMCPToolJSONSuccess({
              message: "Issue not found or no permission to update it",
              result: { found: false, issueKey },
            });
          }
          return makeMCPToolJSONSuccess({
            message: "Issue updated successfully",
            result: {
              ...result.value,
              updatedFields: Object.keys(updateData),
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "create_issue_link",
    "Creates a link between two JIRA issues with a specified relationship type (e.g., 'Blocks', 'Relates', 'Duplicates').",
    {
      linkData: JiraCreateIssueLinkRequestSchema.describe(
        "Link configuration including type and issues to link"
      ),
    },
    async ({ linkData }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await createIssueLink(baseUrl, accessToken, linkData);
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error creating issue link: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Issue link created successfully",
            result: {
              ...linkData,
            },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "delete_issue_link",
    "Deletes an existing link between JIRA issues.",
    {
      linkId: z.string().describe("The ID of the issue link to delete"),
    },
    async ({ linkId }, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await deleteIssueLink(baseUrl, accessToken, linkId);
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error deleting issue link: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Issue link deleted successfully",
            result: { linkId },
          });
        },
        authInfo,
      });
    }
  );

  server.tool(
    "get_issue_link_types",
    "Retrieves all available issue link types that can be used when creating issue links.",
    {},
    async (_, { authInfo }) => {
      return withAuth({
        action: async (baseUrl, accessToken) => {
          const result = await getIssueLinkTypes(baseUrl, accessToken);
          if (result.isErr()) {
            return makeMCPToolTextError(
              `Error retrieving issue link types: ${result.error}`
            );
          }
          return makeMCPToolJSONSuccess({
            message: "Issue link types retrieved successfully",
            result: result.value,
          });
        },
        authInfo,
      });
    }
  );

  return server;
};

export default createServer;
export { serverInfo };
