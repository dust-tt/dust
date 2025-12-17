import { sanitizeFilename } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { PROVIDER_DOWNLOAD_MAX_FILE_SIZE } from "@app/lib/providers/constants";
import {
  fetchGitHubGraphQLNode,
  searchGitHubIssues,
} from "@app/lib/providers/github/client";
import {
  buildContentSummaryForIssue,
  buildContentSummaryForPullRequest,
  truncateGitHubQuery,
} from "@app/lib/providers/github/utils";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";

const PULL_REQUEST_MIME_TYPE = "application/vnd.github.pull-request";
const ISSUE_MIME_TYPE = "application/vnd.github.issue";
const FILE_TRUNCATION_MESSAGE =
  "\n\n---\n\n**Note:** Content was truncated due to size limits. Some comments or reviews may not be included.";

export async function search({
  accessToken,
  query,
  pageSize,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  const truncatedQuery = truncateGitHubQuery(query);
  const result = await searchGitHubIssues({
    accessToken,
    query: truncatedQuery,
    pageSize,
  });

  if (result.isErr()) {
    throw new Error(result.error.message);
  }

  const data = result.value;

  return data.items.map((item) => {
    // Determine if it's an issue or PR based on pull_request field
    const isPullRequest = !!item.pull_request;

    return {
      // Use node_id as the external ID for direct GraphQL node lookup
      externalId: item.node_id,
      mimeType: isPullRequest ? PULL_REQUEST_MIME_TYPE : ISSUE_MIME_TYPE,
      title: `#${item.number}: ${item.title}`,
      type: "document",
      sourceUrl: item.html_url,
    };
  });
}

export async function download({
  accessToken,
  externalId,
}: ToolDownloadParams): Promise<ToolDownloadResult> {
  // externalId is the node_id from GitHub (e.g., "MDU6SXNzdWUzNTgwMg==")
  const graphqlResult = await fetchGitHubGraphQLNode({
    accessToken,
    nodeId: externalId,
  });

  if (graphqlResult.isErr()) {
    throw new Error(graphqlResult.error.message);
  }

  const node = graphqlResult.value.node;
  const number = node.number;

  let content: string;
  let fileName: string;

  if (node.__typename === "PullRequest") {
    fileName = sanitizeFilename(`PR-${node.title}-${number}`);
    content = buildContentSummaryForPullRequest(node);
  } else {
    fileName = sanitizeFilename(`Issue-${node.title}-${number}`);
    content = buildContentSummaryForIssue(node);
  }

  // Truncate content if it exceeds max size
  const contentSize = Buffer.byteLength(content, "utf8");
  if (contentSize > PROVIDER_DOWNLOAD_MAX_FILE_SIZE) {
    // Truncate to max size and add truncation notice
    const truncatedContent = content.slice(
      0,
      PROVIDER_DOWNLOAD_MAX_FILE_SIZE - FILE_TRUNCATION_MESSAGE.length // Leave room for truncation message
    );
    content = truncatedContent + FILE_TRUNCATION_MESSAGE;
  }

  return {
    content,
    fileName,
    contentType: "text/markdown",
  };
}
