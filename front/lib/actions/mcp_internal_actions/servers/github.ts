import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Octokit } from "@octokit/core";
import { z } from "zod";

import { getAccessTokenForInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/authentication";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import { normalizeError } from "@app/types";

const GITHUB_GET_PULL_REQUEST_ACTION_MAX_COMMITS = 32;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "github",
  version: "1.0.0",
  description: "GitHub actions to manage issues and pull requests.",
  authorization: {
    provider: "github" as const,
    use_case: "platform_actions" as const,
  },
  visual: "github",
};

const createServer = (auth: Authenticator, mcpServerId: string): McpServer => {
  const server = new McpServer(serverInfo);

  server.tool(
    "create_issue",
    "Create a new issue on a specified GitHub repository.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      title: z.string().describe("The title of the issue."),
      body: z.string().describe("The contents of the issue (GitHub markdown)."),
    },
    async ({ owner, repo, title, body }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "github",
      });

      const octokit = new Octokit({ auth: accessToken });

      try {
        const { data: issue } = await octokit.request(
          "POST /repos/{owner}/{repo}/issues",
          {
            owner,
            repo,
            title,
            body,
          }
        );

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: `Issue created: #${issue.number}`,
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error creating GitHub issue: ${normalizeError(e).message}`,
            },
          ],
        };
      }
    }
  );

  server.tool(
    "get_pull_request",
    "Retrieve a pull request from a specified GitHub repository including" +
      " its associated description, diff, comments and reviews.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      pullNumber: z.number().describe("The pull request number."),
    },
    async ({ owner, repo, pullNumber }) => {
      const accessToken = await getAccessTokenForInternalMCPServer(auth, {
        mcpServerId,
        provider: "github",
      });

      const octokit = new Octokit({ auth: accessToken });

      try {
        const query = `
          query($owner: String!, $repo: String!, $pullNumber: Int!) {
            repository(owner: $owner, name: $repo) {
              pullRequest(number: $pullNumber) {
                title
                body
                commits(last: ${GITHUB_GET_PULL_REQUEST_ACTION_MAX_COMMITS}) {
                  nodes {
                    commit {
                      oid
                      message
                      author {
                        user {
                          login
                        }
                      }
                    }
                  }
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
                    comments(first: 100) {
                      nodes {
                        body
                        path
                        line
                      }
                    }
                  }
                }
              }
            }
          }`;

        // Get the PR description and base/head commit
        const pull = (await octokit.graphql(query, {
          owner,
          repo,
          pullNumber,
        })) as {
          repository: {
            pullRequest: {
              title: string;
              body: string;
              commits: {
                nodes: {
                  commit: {
                    oid: string;
                    message: string;
                    author: {
                      user: {
                        login: string;
                      };
                    };
                  };
                }[];
              };
              comments: {
                nodes: {
                  author: {
                    login: string;
                  };
                  body: string;
                  createdAt: string;
                }[];
              };
              reviews: {
                nodes: {
                  author: {
                    login: string;
                  };
                  body: string;
                  state: string;
                  createdAt: string;
                  comments: {
                    nodes: {
                      body: string;
                      path: string;
                      line: number;
                    }[];
                  };
                }[];
              };
            };
          };
        };

        const pullTitle = pull.repository.pullRequest.title;
        const pullBody = pull.repository.pullRequest.body;
        const pullCommits = pull.repository.pullRequest.commits.nodes.map(
          (n) => {
            return {
              sha: n.commit.oid,
              message: n.commit.message,
              author: n.commit.author.user.login,
            };
          }
        );
        const pullComments = pull.repository.pullRequest.comments.nodes.map(
          (n) => {
            return {
              createdAt: new Date(n.createdAt).getTime(),
              author: n.author.login,
              body: n.body,
            };
          }
        );
        const pullReviews = pull.repository.pullRequest.reviews.nodes.map(
          (n) => {
            return {
              createdAt: new Date(n.createdAt).getTime(),
              author: n.author.login,
              body: n.body,
              state: n.state,
              comments: n.comments.nodes.map((c) => {
                return {
                  body: c.body,
                  path: c.path,
                  line: c.line,
                };
              }),
            };
          }
        );

        // const formatDiffWithLineNumbers = (diff: string) => {
        //   const lines = diff.split("\n");
        //   let oldLineNum = 0;
        //   let newLineNum = 0;

        //   return lines
        //     .map((line) => {
        //       if (
        //         !line.startsWith("+") &&
        //         !line.startsWith("-") &&
        //         !line.startsWith(" ") &&
        //         !line.startsWith("@")
        //       ) {
        //         return line;
        //       }

        //       if (line.startsWith("@@")) {
        //         // Reset line numbers based on hunk header
        //         const match = line.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/);
        //         if (match) {
        //           oldLineNum = parseInt(match[1]) - 1;
        //           newLineNum = parseInt(match[2]) - 1;
        //         }
        //         return line;
        //       }

        //       if (line.startsWith("-")) {
        //         oldLineNum++;
        //         return `${oldLineNum}: ${line}`;
        //       }
        //       if (line.startsWith("+")) {
        //         newLineNum++;
        //         return `${newLineNum}: ${line}`;
        //       }
        //       oldLineNum++;
        //       newLineNum++;
        //       return `${newLineNum}: ${line}`;
        //     })
        //     .join("\n");
        // };

        // Get the actual diff using REST API (not available in GraphQL)
        const diff = await octokit.request(
          "GET /repos/{owner}/{repo}/pulls/{pull_number}",
          {
            owner,
            repo,
            pull_number: pullNumber,
            headers: {
              Accept: "application/vnd.github.v3.diff",
            },
          }
        );
        // @ts-expect-error - data is a string when mediatType.format is `diff` (wrongly typed as
        // their defauilt response type)
        const pullDiff = diff.data as string;

        const content =
          `TITLE: ${pullTitle}\n\n` +
          `BODY:\n` +
          `${pullBody}\n\n` +
          `COMMITS:\n` +
          `${(pullCommits || [])
            .map((c) => `${c.sha} ${c.author}: ${c.message}`)
            .join("\n")}\n\n` +
          `DIFF:\n` +
          `${pullDiff}\n\n` +
          `COMMENTS:\n` +
          `${(pullComments || [])
            .map((c) => {
              return `${c.author} [${new Date(c.createdAt).toISOString()}]:\n${c.body}`;
            })
            .join("\n")}\n\n` +
          `REVIEWS:\n` +
          `${(pullReviews || [])
            .map(
              (r) =>
                `${r.author} [${new Date(r.createdAt).toISOString()}]:\n(${r.state})\n${r.body}\n${(
                  r.comments || []
                )
                  .map((c) => ` - ${c.path}:${c.line}:\n${c.body}`)
                  .join("\n")}`
            )
            .join("\n")}`;

        return {
          isError: false,
          content: [
            {
              type: "text",
              text: content,
            },
          ],
        };
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Error retrieving GitHub pull request: ${normalizeError(e).message}`,
            },
          ],
        };
      }
    }
  );

  return server;
};

export default createServer;
