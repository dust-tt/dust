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
  console.log(query)
  try {
    // Use GitHub's REST API to search both issues and pull requests
    // The /search/issues endpoint searches both issues and PRs
    // Search in title, body, and comments for comprehensive results
    // No explicit sort - uses GitHub's "best match" which balances relevance and recency
    const { data } = await github.request("GET /search/issues", {
      q: query,
      per_page: Math.min(pageSize, 100),
    });
    console.log(data)

    return data.items.map((item: any) => {
      // Determine if it's an issue or PR based on pull_request field
      const isPullRequest = !!item.pull_request;

      // Store owner/repo/number for easier download later
      // Extract from html_url: https://github.com/{owner}/{repo}/issues/{number}
      const urlParts = item.html_url.split("/");
      const number = urlParts[urlParts.length - 1];
      const repo = urlParts[urlParts.length - 3];
      const owner = urlParts[urlParts.length - 4];

      return {
        externalId: `${owner}/${repo}/${isPullRequest ? "pull" : "issues"}/${number}`,
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

  // Parse externalId format: {owner}/{repo}/{type}/{number}
  // Example: "octocat/Hello-World/issues/1" or "octocat/Hello-World/pull/42"
  const parts = externalId.split("/");
  if (parts.length !== 4) {
    throw new Error(`Invalid externalId format: ${externalId}`);
  }

  const [owner, repo, type, numberStr] = parts;
  const number = parseInt(numberStr, 10);

  if (!owner || !repo || !number) {
    throw new Error(`Invalid externalId format: ${externalId}`);
  }

  const isPullRequest = type === "pull";

  let content = "";
  let fileName = "";

  try {
    if (isPullRequest) {
      // Fetch pull request body, comments, and reviews
      const query = `
        query($owner: String!, $repo: String!, $pullNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            pullRequest(number: $pullNumber) {
              title
              body
              state
              url
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
        owner,
        repo,
        pullNumber: number,
      })) as {
        repository: {
          pullRequest: {
            title: string;
            body: string;
            state: string;
            url: string;
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
      };

      const pr = result.repository.pullRequest;
      fileName = `PR-${number}-${pr.title.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50)}`;

      content = `# Pull Request #${number}: ${pr.title}\n\n`;
      content += `**Repository:** ${owner}/${repo}\n`;
      content += `**Author:** @${pr.author.login}\n`;
      content += `**State:** ${pr.state}\n`;
      content += `**URL:** ${pr.url}\n\n`;

      if (pr.body) {
        content += `## Description\n\n${pr.body}\n\n`;
      }

      if (pr.comments.nodes.length > 0) {
        content += `## Comments (${pr.comments.nodes.length})\n\n`;
        for (const comment of pr.comments.nodes) {
          content += `### @${comment.author.login} (${comment.createdAt})\n\n`;
          content += `${comment.body}\n\n`;
        }
      }

      if (pr.reviews.nodes.length > 0) {
        content += `## Reviews (${pr.reviews.nodes.length})\n\n`;
        for (const review of pr.reviews.nodes) {
          content += `### @${review.author.login} - ${review.state} (${review.createdAt})\n\n`;
          if (review.body) {
            content += `${review.body}\n\n`;
          }
        }
      }
    } else {
      // Fetch issue body and comments
      const query = `
        query($owner: String!, $repo: String!, $issueNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issueNumber) {
              title
              body
              state
              url
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
          }
        }`;

      const result = (await github.graphql(query, {
        owner,
        repo,
        issueNumber: number,
      })) as {
        repository: {
          issue: {
            title: string;
            body: string;
            state: string;
            url: string;
            author: { login: string };
            comments: {
              nodes: { author: { login: string }; body: string; createdAt: string }[];
            };
          };
        };
      };

      const issue = result.repository.issue;
      fileName = `Issue-${number}-${issue.title.replace(/[^a-zA-Z0-9]/g, "-").substring(0, 50)}`;

      content = `# Issue #${number}: ${issue.title}\n\n`;
      content += `**Repository:** ${owner}/${repo}\n`;
      content += `**Author:** @${issue.author.login}\n`;
      content += `**State:** ${issue.state}\n`;
      content += `**URL:** ${issue.url}\n\n`;

      if (issue.body) {
        content += `## Description\n\n${issue.body}\n\n`;
      }

      if (issue.comments.nodes.length > 0) {
        content += `## Comments (${issue.comments.nodes.length})\n\n`;
        for (const comment of issue.comments.nodes) {
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
      `Failed to download GitHub ${isPullRequest ? "pull request" : "issue"}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}
