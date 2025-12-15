import { sanitizeFilename } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import {
  fetchGitHubGraphQLNode,
  searchGitHubIssues,
} from "@app/lib/providers/github/client";
import {
  buildContentSummaryForIssue,
  buildContentSummaryForPullRequest,
  MAX_FILE_SIZE,
} from "@app/lib/providers/github/utils";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";

export async function search({
  accessToken,
  query,
  pageSize,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  // Use GitHub's REST API for search
  // The /search/issues endpoint gives both issues and PRs
  // GitHub's default "best match" search balances relevance and recency
  const result = await searchGitHubIssues({
    accessToken,
    query,
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
      mimeType: isPullRequest
        ? "application/vnd.github.pull-request"
        : "application/vnd.github.issue",
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
  if (contentSize > MAX_FILE_SIZE) {
    // Truncate to max size and add truncation notice
    const truncatedContent = content.slice(
      0,
      MAX_FILE_SIZE - 200 // Leave room for truncation message
    );
    content =
      truncatedContent +
      "\n\n---\n\n**Note:** Content was truncated due to size limits. Some comments or reviews may not be included.";
  }

  return {
    content,
    fileName,
    contentType: "text/markdown",
  };
}
