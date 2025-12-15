import {
  getGitHubClient,
  MAX_FILE_SIZE,
} from "@app/lib/providers/github/utils";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";

export async function search({
  accessToken,
  query,
  pageSize,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  const github = getGitHubClient(accessToken);

  try {
    // Use GitHub's REST API for search
    // The /search/issues endpoint queries both issues and PRs
    // Uses GitHub's "best match" default search which balances relevance and recency
    const { data } = await github.request("GET /search/issues", {
      q: query,
      per_page: Math.min(pageSize, 100),
    });

    return data.items.map((item: any) => {
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
  } catch (error) {
    logger.error(
      {
        error,
        query,
      },
      "Error searching GitHub issues/PRs"
    );
    return [];
  }
}

export async function download({
  accessToken,
  externalId,
}: ToolDownloadParams): Promise<ToolDownloadResult> {
  const github = getGitHubClient(accessToken);

  // externalId is the node_id from GitHub (e.g., "MDU6SXNzdWUzNTgwMg==")
  let content = "";
  let fileName = "";
  let typeName = "issue/pull request"; // Default for error messages

  try {
    // Use the node query with inline fragments to handle both issues and PRs
    const query = `
      query($nodeId: ID!) {
        node(id: $nodeId) {
          ... on Issue {
            __typename
            number
            title
            body
            state
            url
            repository {
              owner {
                login
              }
              name
            }
            author {
              login
            }
            comments(first: 100) {
              nodes {
                author {
                  login
                }
                body
                createdAt
              }
            }
          }
          ... on PullRequest {
            __typename
            number
            title
            body
            state
            url
            repository {
              owner {
                login
              }
              name
            }
            author {
              login
            }
            comments(first: 100) {
              nodes {
                author {
                  login
                }
                body
                createdAt
              }
            }
            reviews(first: 100) {
              nodes {
                author {
                  login
                }
                body
                state
                createdAt
              }
            }
          }
        }
      }`;

    const result = (await github.graphql(query, {
      nodeId: externalId,
    })) as {
      node:
        | {
            __typename: "Issue";
            number: number;
            title: string;
            body: string;
            state: string;
            url: string;
            repository: {
              owner: { login: string };
              name: string;
            };
            author: { login: string };
            comments: {
              nodes: { author: { login: string }; body: string; createdAt: string }[];
            };
          }
        | {
            __typename: "PullRequest";
            number: number;
            title: string;
            body: string;
            state: string;
            url: string;
            repository: {
              owner: { login: string };
              name: string;
            };
            author: { login: string };
            comments: {
              nodes: { author: { login: string }; body: string; createdAt: string }[];
            };
            reviews: {
              nodes: {
                author: { login: string };
                body: string;
                state: string;
                createdAt: string;
              }[];
            };
          };
    };

    const node = result.node;
    const owner = node.repository.owner.login;
    const repo = node.repository.name;
    const number = node.number;
    typeName = node.__typename === "PullRequest" ? "pull request" : "issue";

    if (node.__typename === "PullRequest") {
      fileName = `PR-${number}-${node.title.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50)}`;

      content = `# Pull Request #${number}: ${node.title}\n\n`;
      content += `**Repository:** ${owner}/${repo}\n`;
      content += `**Author:** @${node.author.login}\n`;
      content += `**State:** ${node.state}\n`;
      content += `**URL:** ${node.url}\n\n`;

      if (node.body) {
        content += `## Description\n\n${node.body}\n\n`;
      }

      if (node.comments.nodes.length > 0) {
        content += `## Comments (${node.comments.nodes.length})\n\n`;
        for (const comment of node.comments.nodes) {
          content += `### @${comment.author.login} (${comment.createdAt})\n\n`;
          content += `${comment.body}\n\n`;
        }
      }

      if (node.reviews.nodes.length > 0) {
        content += `## Reviews (${node.reviews.nodes.length})\n\n`;
        for (const review of node.reviews.nodes) {
          content += `### @${review.author.login} - ${review.state} (${review.createdAt})\n\n`;
          if (review.body) {
            content += `${review.body}\n\n`;
          }
        }
      }
    } else {
      // Issue
      fileName = `Issue-${number}-${node.title.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50)}`;

      content = `# Issue #${number}: ${node.title}\n\n`;
      content += `**Repository:** ${owner}/${repo}\n`;
      content += `**Author:** @${node.author.login}\n`;
      content += `**State:** ${node.state}\n`;
      content += `**URL:** ${node.url}\n\n`;

      if (node.body) {
        content += `## Description\n\n${node.body}\n\n`;
      }

      if (node.comments.nodes.length > 0) {
        content += `## Comments (${node.comments.nodes.length})\n\n`;
        for (const comment of node.comments.nodes) {
          content += `### @${comment.author.login} (${comment.createdAt})\n\n`;
          content += `${comment.body}\n\n`;
        }
      }
    }

    // Check content size
    const contentSize = Buffer.byteLength(content, "utf8");
    if (contentSize > MAX_FILE_SIZE) {
      throw new Error(
        `Content size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
      );
    }

    return {
      content,
      fileName,
      contentType: "text/markdown",
    };
  } catch (error) {
    throw new Error(
      `Failed to download GitHub ${typeName}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
