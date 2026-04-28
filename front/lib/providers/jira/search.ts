import {
  getIssue,
  getIssueComments,
  getJiraBaseUrlAndResourceInfo,
  searchJiraIssuesUsingJql,
} from "@app/lib/api/actions/servers/jira/jira_api_helper";
import { renderIssue } from "@app/lib/api/actions/servers/jira/rendering";
import { PROVIDER_DOWNLOAD_MAX_FILE_SIZE } from "@app/lib/providers/constants";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";

const ISSUE_MIME_TYPE = "application/vnd.jira.issue";
const FILE_TRUNCATION_MESSAGE =
  "\n\n---\n\n**Note:** Content was truncated due to size limits.";

export async function search({
  accessToken,
  query,
  pageSize,
  metadata,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  const cloudUrl = metadata?.jira_cloud_url ?? null;
  const jiraResult = await getJiraBaseUrlAndResourceInfo(accessToken, cloudUrl);
  if (!jiraResult) {
    return [];
  }
  const { baseUrl, resourceInfo } = jiraResult;

  const issueKeyMatch = query.match(/^#?([A-Z][A-Z0-9]*-\d+)$/i);

  if (issueKeyMatch) {
    const issueKey = issueKeyMatch[1].toUpperCase();
    const issueResult = await getIssue({
      baseUrl,
      resourceInfo,
      accessToken,
      issueKey,
    });

    if (issueResult.isErr() || issueResult.value === null) {
      return [];
    }

    const issue = issueResult.value;
    return [
      {
        externalId: issue.key,
        title: `${issue.key}: ${issue.fields?.summary ?? "No summary"}`,
        mimeType: ISSUE_MIME_TYPE,
        type: "document" as const,
        sourceUrl: issue.browseUrl ?? null,
      },
    ];
  }

  const jql = `summary ~ "${query.replace(/"/g, '\\"')}" ORDER BY updated DESC`;
  const result = await searchJiraIssuesUsingJql(
    baseUrl,
    resourceInfo,
    accessToken,
    jql,
    {
      maxResults: pageSize,
      fields: ["summary"],
    }
  );

  if (result.isErr()) {
    return [];
  }

  return result.value.issues.map((issue) => ({
    externalId: issue.key,
    title: `${issue.key}: ${issue.fields?.summary ?? "No summary"}`,
    mimeType: ISSUE_MIME_TYPE,
    type: "document" as const,
    sourceUrl: issue.browseUrl ?? null,
  }));
}

export async function download({
  accessToken,
  externalId,
  metadata,
}: ToolDownloadParams): Promise<ToolDownloadResult> {
  const cloudUrl = metadata?.jira_cloud_url ?? null;
  const jiraResult = await getJiraBaseUrlAndResourceInfo(accessToken, cloudUrl);
  if (!jiraResult) {
    throw new Error("Failed to get Jira base URL or resource info");
  }
  const { baseUrl, resourceInfo } = jiraResult;

  const issueResult = await getIssue({
    baseUrl,
    resourceInfo,
    accessToken,
    issueKey: externalId,
    fields: [
      "summary",
      "description",
      "issuetype",
      "priority",
      "assignee",
      "reporter",
      "labels",
      "duedate",
      "parent",
      "project",
      "status",
      "created",
      "updated",
    ],
  });

  if (issueResult.isErr()) {
    throw new Error(issueResult.error);
  }

  if (issueResult.value === null) {
    throw new Error(`Issue ${externalId} not found`);
  }

  const commentsResult = await getIssueComments({
    baseUrl,
    accessToken,
    issueKey: externalId,
  });

  const comments = commentsResult.isOk() ? commentsResult.value.comments : [];

  const issue = issueResult.value;
  let content = renderIssue(issue, comments);

  const contentSize = Buffer.byteLength(content, "utf8");
  if (contentSize > PROVIDER_DOWNLOAD_MAX_FILE_SIZE) {
    const truncatedContent = content.slice(
      0,
      PROVIDER_DOWNLOAD_MAX_FILE_SIZE - FILE_TRUNCATION_MESSAGE.length
    );
    content = truncatedContent + FILE_TRUNCATION_MESSAGE;
  }

  const summary = issue.fields?.summary ?? "No summary";
  const fileName = `${externalId}: ${summary}`;

  return {
    content,
    fileName,
    contentType: "text/markdown",
  };
}
