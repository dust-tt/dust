import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  createComment,
  createIssue,
  createIssueLink,
  deleteIssueLink,
  extractTextFromAttachment,
  getAttachmentContent,
  getConnectionInfo,
  getIssue,
  getIssueAttachments,
  getIssueFields,
  getIssueLinkTypes,
  getIssueTypes,
  getProject,
  getProjects,
  getProjectVersions,
  getTransitions,
  listFieldSummaries,
  listUsers,
  searchIssues,
  searchJiraIssuesUsingJql,
  searchUsersByEmailExact,
  transitionIssue,
  updateIssue,
  uploadAttachmentsToJira,
  withAuth,
} from "@app/lib/actions/mcp_internal_actions/servers/jira/jira_api_helper";
import { renderIssueWithEmbeddedComments } from "@app/lib/actions/mcp_internal_actions/servers/jira/rendering";
import { SEARCH_USERS_MAX_RESULTS } from "@app/lib/actions/mcp_internal_actions/servers/jira/types";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { processAttachment } from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import { getFileFromConversationAttachment } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { JIRA_TOOLS_METADATA } from "@app/lib/api/actions/servers/jira/metadata";
import logger from "@app/logger/logger";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof JIRA_TOOLS_METADATA> = {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_issue_read_fields: async (_params, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await listFieldSummaries(baseUrl, accessToken);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error retrieving fields: ${result.error}`)
          );
        }
        return new Ok([
          { type: "text" as const, text: "Fields retrieved successfully" },
          {
            type: "text" as const,
            text: JSON.stringify(result.value, null, 2),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_issue: async ({ issueKey, fields }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const issue = await getIssue({
          baseUrl,
          accessToken,
          issueKey,
          fields,
        });
        if (issue.isOk() && issue.value === null) {
          return new Ok([
            {
              type: "text" as const,
              text: "No issue found with the specified key",
            },
            {
              type: "text" as const,
              text: JSON.stringify({ found: false, issueKey }, null, 2),
            },
          ]);
        }
        if (issue.isErr()) {
          return new Err(
            new MCPError(`Error retrieving issue: ${issue.error}`)
          );
        }

        const issueText = issue.value
          ? renderIssueWithEmbeddedComments(issue.value)
          : "";

        return new Ok([
          { type: "text" as const, text: "Issue retrieved successfully" },
          {
            type: "text" as const,
            text: issueText,
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_projects: async (_params, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await getProjects(baseUrl, accessToken);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error retrieving projects: ${result.error}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Projects retrieved successfully",
          },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_project: async ({ projectKey }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await getProject(baseUrl, accessToken, projectKey);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error retrieving project: ${result.error}`)
          );
        }
        if (result.value === null) {
          return new Err(
            new MCPError(
              `No project found with the specified key: ${projectKey}`
            )
          );
        }
        return new Ok([
          { type: "text" as const, text: "Project retrieved successfully" },
          {
            type: "text" as const,
            text: JSON.stringify(result.value, null, 2),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_project_versions: async ({ projectKey }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await getProjectVersions(
          baseUrl,
          accessToken,
          projectKey
        );
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error retrieving project versions: ${result.error}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Project versions retrieved successfully",
          },
          {
            type: "text" as const,
            text: JSON.stringify(result.value, null, 2),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_transitions: async ({ issueKey }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await getTransitions(baseUrl, accessToken, issueKey);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error retrieving transitions: ${result.error}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Transitions retrieved successfully",
          },
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_issues: async ({ filters, sortBy, nextPageToken }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await searchIssues(baseUrl, accessToken, filters, {
          nextPageToken,
          sortBy,
        });
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error searching issues: ${result.error}`)
          );
        }
        const message =
          result.value.issues.length === 0
            ? "No issues found matching the search criteria"
            : `Found ${result.value.issues.length} issue(s)`;

        const issueTexts = result.value.issues.map((issue, index) => {
          const formatted = renderIssueWithEmbeddedComments(issue);
          return index > 0 ? `\n${"-".repeat(80)}\n\n${formatted}` : formatted;
        });

        let outputText = message + "\n\n";
        outputText += issueTexts.join("\n");

        if (result.value.nextPageToken) {
          outputText += `\n\nNote: More results available. Use nextPageToken: ${result.value.nextPageToken} to fetch the next page.`;
        }

        return new Ok([
          { type: "text" as const, text: message },
          {
            type: "text" as const,
            text: outputText,
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_issues_using_jql: async (
    { jql, maxResults, fields, nextPageToken },
    { authInfo }
  ) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await searchJiraIssuesUsingJql(
          baseUrl,
          accessToken,
          jql,
          {
            maxResults,
            fields,
            nextPageToken,
          }
        );
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error executing JQL search: ${result.error}`)
          );
        }
        const message =
          result.value.issues.length === 0
            ? "No issues found matching the JQL query"
            : `Found ${result.value.issues.length} issue(s) using JQL`;

        const issueTexts = result.value.issues.map((issue, index) => {
          const formatted = renderIssueWithEmbeddedComments(issue);
          return index > 0 ? `\n${"-".repeat(80)}\n\n${formatted}` : formatted;
        });

        let outputText = message + "\n\n";
        outputText += issueTexts.join("\n");

        if (result.value.nextPageToken) {
          outputText += `\n\nNote: More results available. Use nextPageToken: ${result.value.nextPageToken} to fetch the next page.`;
        }

        return new Ok([
          { type: "text" as const, text: message },
          {
            type: "text" as const,
            text: outputText,
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_issue_types: async ({ projectKey }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        try {
          const result = await getIssueTypes(baseUrl, accessToken, projectKey);
          if (result.isErr()) {
            return new Err(
              new MCPError(`Error retrieving issue types: ${result.error}`)
            );
          }
          return new Ok([
            {
              type: "text" as const,
              text: "Issue types retrieved successfully",
            },
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ]);
        } catch (error) {
          return new Err(
            new MCPError(
              `Error retrieving issue types: ${normalizeError(error).message}`
            )
          );
        }
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_issue_create_fields: async (
    { projectKey, issueTypeId },
    { authInfo }
  ) => {
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
            return new Err(
              new MCPError(`Error retrieving issue fields: ${result.error}`)
            );
          }
          return new Ok([
            {
              type: "text" as const,
              text: "Issue fields retrieved successfully",
            },
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ]);
        } catch (error) {
          return new Err(
            new MCPError(
              `Error retrieving issue fields: ${normalizeError(error).message}`
            )
          );
        }
      },
      authInfo,
    });
  },

  get_connection_info: async (_params, { authInfo }) => {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return new Err(new MCPError("No access token found"));
    }

    const connectionInfo = await getConnectionInfo(accessToken);
    if (connectionInfo.isErr()) {
      return new Err(
        new MCPError(
          `Failed to retrieve connection information: ${connectionInfo.error}`
        )
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text: "Connection information retrieved successfully",
      },
      {
        type: "text" as const,
        text: JSON.stringify(connectionInfo, null, 2),
      },
    ]);
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_issue_link_types: async (_params, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await getIssueLinkTypes(baseUrl, accessToken);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error retrieving issue link types: ${result.error}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Issue link types retrieved successfully",
          },
          {
            type: "text" as const,
            text: JSON.stringify(result.value, null, 2),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_users: async (
    { emailAddress, name, maxResults = SEARCH_USERS_MAX_RESULTS, startAt },
    { authInfo }
  ) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        if (emailAddress) {
          const result = await searchUsersByEmailExact(
            baseUrl,
            accessToken,
            emailAddress,
            { maxResults, startAt }
          );
          if (result.isErr()) {
            return new Err(
              new MCPError(`Error searching users: ${result.error}`)
            );
          }

          const message =
            result.value.users.length === 0
              ? "No users found with the specified email address"
              : `Found ${result.value.users.length} exact match(es) for the specified email address`;
          return new Ok([
            { type: "text" as const, text: message },
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  users: result.value.users,
                  nextStartAt: result.value.nextStartAt,
                },
                null,
                2
              ),
            },
          ]);
        }

        const result = await listUsers(baseUrl, accessToken, {
          name,
          maxResults,
          startAt,
        });
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error searching users: ${result.error}`)
          );
        }

        const message =
          result.value.users.length === 0
            ? name
              ? "No users found matching the name"
              : "No users found"
            : name
              ? `Found ${result.value.users.length} user(s) matching the name`
              : `Listed ${result.value.users.length} user(s)`;
        return new Ok([
          { type: "text" as const, text: message },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                users: result.value.users,
                nextStartAt: result.value.nextStartAt,
              },
              null,
              2
            ),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_attachments: async ({ issueKey }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const attachmentsResult = await getIssueAttachments({
          baseUrl,
          accessToken,
          issueKey,
        });

        if (attachmentsResult.isErr()) {
          return new Err(new MCPError(attachmentsResult.error));
        }

        const attachments = attachmentsResult.value;
        const attachmentSummary = attachments.map((att) => ({
          id: att.id,
          filename: att.filename,
          size: att.size,
          mimeType: att.mimeType,
          created: att.created,
          author: att.author?.displayName ?? att.author?.accountId,
          content: att.content,
          thumbnail: att.thumbnail,
        }));

        return new Ok([
          {
            type: "text" as const,
            text: `Found ${attachments.length} attachment(s) for issue ${issueKey}`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                issueKey,
                attachments: attachmentSummary,
                totalAttachments: attachments.length,
                totalSize: attachments.reduce(
                  (sum, att) => sum + (att.size || 0),
                  0
                ),
              },
              null,
              2
            ),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  read_attachment: async ({ issueKey, attachmentId }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        try {
          const attachmentsResult = await getIssueAttachments({
            baseUrl,
            accessToken,
            issueKey,
          });

          if (attachmentsResult.isErr()) {
            return new Err(new MCPError(attachmentsResult.error));
          }

          const attachments = attachmentsResult.value;
          const targetAttachment = attachments.find(
            (att) => att.id === attachmentId
          );
          if (!targetAttachment) {
            return new Err(
              new MCPError(
                `Attachment with ID ${attachmentId} not found on issue ${issueKey}`
              )
            );
          }
          return await processAttachment({
            mimeType: targetAttachment.mimeType,
            filename: targetAttachment.filename,
            extractText: async () =>
              extractTextFromAttachment({
                baseUrl,
                accessToken,
                attachmentId,
                mimeType: targetAttachment.mimeType,
              }),
            downloadContent: async () => {
              const result = await getAttachmentContent({
                baseUrl,
                accessToken,
                attachmentId,
                mimeType: targetAttachment.mimeType,
              });
              if (result.isErr()) {
                return result;
              }
              return new Ok(Buffer.from(result.value.content, "base64"));
            },
          });
        } catch (error) {
          logger.error(`Error in read_attachment:`, {
            error: error,
            issueKey,
            attachmentId,
          });
          return new Err(
            new MCPError(
              `Error in read_attachment: ${normalizeError(error).message}`
            )
          );
        }
      },
      authInfo,
    });
  },

  // Write operations
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
    create_comment: async (
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
          return new Err(new MCPError(`Error adding comment: ${result.error}`));
        }
        if (result.value === null) {
          return new Ok([
            {
              type: "text" as const,
              text: "Issue not found or no permission to add comment",
            },
            {
              type: "text" as const,
              text: JSON.stringify({ found: false, issueKey }, null, 2),
            },
          ]);
        }
        return new Ok([
          { type: "text" as const, text: "Comment added successfully" },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                issueKey,
                comment:
                  typeof comment === "string" ? comment : "[Rich ADF Content]",
                commentId: result.value.id,
              },
              null,
              2
            ),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  transition_issue: async ({ issueKey, transitionId }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await transitionIssue(
          baseUrl,
          accessToken,
          issueKey,
          transitionId
        );
        if (result.isErr()) {
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
          return new Err(new MCPError(errorMessage));
        }
        if (result.value === null) {
          return new Ok([
            {
              type: "text" as const,
              text: "Issue not found or no permission to transition it",
            },
            {
              type: "text" as const,
              text: JSON.stringify({ found: false, issueKey }, null, 2),
            },
          ]);
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Issue transitioned successfully",
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                issueKey,
                transitionId,
              },
              null,
              2
            ),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_issue: async ({ issueData }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await createIssue(baseUrl, accessToken, issueData);
        if (result.isErr()) {
          let errorMessage = `Error creating issue: ${result.error}`;
          if (
            result.error.includes("cannot be set") ||
            result.error.includes("not on the appropriate screen")
          ) {
            errorMessage = `Field configuration error: ${result.error}. Some fields are not available for this project/issue type. Use get_issue_create_fields to check which fields are required and available before creating issues.`;
          }
          return new Err(new MCPError(errorMessage));
        }
        return new Ok([
          { type: "text" as const, text: "Issue created successfully" },
          {
            type: "text" as const,
            text: JSON.stringify(result.value, null, 2),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  update_issue: async ({ issueKey, updateData }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await updateIssue(
          baseUrl,
          accessToken,
          issueKey,
          updateData
        );
        if (result.isErr()) {
          return new Err(new MCPError(`Error updating issue: ${result.error}`));
        }
        if (result.value === null) {
          return new Ok([
            {
              type: "text" as const,
              text: "Issue not found or no permission to update it",
            },
            {
              type: "text" as const,
              text: JSON.stringify({ found: false, issueKey }, null, 2),
            },
          ]);
        }
        return new Ok([
          { type: "text" as const, text: "Issue updated successfully" },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ...result.value,
                updatedFields: Object.keys(updateData),
              },
              null,
              2
            ),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_issue_link: async ({ linkData }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await createIssueLink(baseUrl, accessToken, linkData);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error creating issue link: ${result.error}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Issue link created successfully",
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                ...linkData,
              },
              null,
              2
            ),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  delete_issue_link: async ({ linkId }, { authInfo }) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        const result = await deleteIssueLink(baseUrl, accessToken, linkId);
        if (result.isErr()) {
          return new Err(
            new MCPError(`Error deleting issue link: ${result.error}`)
          );
        }
        return new Ok([
          {
            type: "text" as const,
            text: "Issue link deleted successfully",
          },
          {
            type: "text" as const,
            text: JSON.stringify({ linkId }, null, 2),
          },
        ]);
      },
      authInfo,
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  upload_attachment: async (
    { issueKey, attachment },
    { auth, authInfo, agentLoopContext }
  ) => {
    return withAuth({
      action: async (baseUrl, accessToken) => {
        let fileToUpload: {
          buffer: Buffer;
          filename: string;
          contentType: string;
        };

        if (attachment.type === "conversation_file") {
          if (!agentLoopContext) {
            return new Err(
              new MCPError(
                "Conversation context required for conversation file attachments"
              )
            );
          }

          const fileResult = await getFileFromConversationAttachment(
            auth,
            attachment.fileId,
            agentLoopContext
          );

          if (fileResult.isErr()) {
            return new Err(
              new MCPError(
                `Failed to get conversation file ${attachment.fileId}: ${fileResult.error}`
              )
            );
          }

          fileToUpload = fileResult.value;
        } else if (attachment.type === "external_file") {
          const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
          const estimatedSize = (attachment.base64Data.length * 3) / 4;

          if (estimatedSize > MAX_FILE_SIZE_BYTES) {
            return new Err(
              new MCPError(
                `File ${attachment.filename} is too large. Maximum size allowed is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`
              )
            );
          }

          try {
            const buffer = Buffer.from(attachment.base64Data, "base64");
            fileToUpload = {
              buffer,
              filename: attachment.filename,
              contentType: attachment.contentType,
            };
          } catch (error) {
            return new Err(
              new MCPError(
                `Failed to decode base64 data for ${attachment.filename}: ${normalizeError(error).message}`
              )
            );
          }
        } else {
          return new Err(new MCPError("Invalid attachment type"));
        }

        const uploadResult = await uploadAttachmentsToJira(
          baseUrl,
          accessToken,
          issueKey,
          [fileToUpload]
        );

        if (uploadResult.isErr()) {
          return new Err(
            new MCPError(`Failed to upload attachment: ${uploadResult.error}`)
          );
        }

        const uploadedAttachment = uploadResult.value[0];

        return new Ok([
          {
            type: "text" as const,
            text: `Successfully uploaded attachment to issue ${issueKey}`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                issueKey,
                attachment: {
                  id: uploadedAttachment.id,
                  filename: uploadedAttachment.filename,
                  size: uploadedAttachment.size,
                  mimeType: uploadedAttachment.mimeType,
                  created: uploadedAttachment.created,
                  author:
                    uploadedAttachment.author.displayName ??
                    uploadedAttachment.author.accountId,
                },
              },
              null,
              2
            ),
          },
        ]);
      },
      authInfo,
    });
  },
};

export const TOOLS = buildTools(JIRA_TOOLS_METADATA, handlers);
