import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Octokit } from "@octokit/core";
import { z } from "zod";

import {
  makeMCPToolTextError,
  makeMCPToolTextSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import type { InternalMCPServerDefinitionType } from "@app/lib/api/mcp";
import { normalizeError } from "@app/types";

const GITHUB_GET_PULL_REQUEST_ACTION_MAX_COMMITS = 32;

const serverInfo: InternalMCPServerDefinitionType = {
  name: "github",
  version: "1.0.0",
  description: "GitHub tools to manage issues and pull requests.",
  authorization: {
    provider: "github" as const,
    use_case: "platform_actions" as const,
    supported_use_cases: ["platform_actions"] as const,
  },
  icon: "GithubLogo",
  documentationUrl: null,
};

const createServer = (): McpServer => {
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
      assignees: z
        .array(z.string())
        .optional()
        .describe("Logins for Users to assign to this issue."),
      labels: z
        .array(z.string())
        .optional()
        .describe("Labels to associate with this issue."),
    },
    async ({ owner, repo, title, body, assignees, labels }, { authInfo }) => {
      const accessToken = authInfo?.token;

      const octokit = new Octokit({ auth: accessToken });

      try {
        const { data: issue } = await octokit.request(
          "POST /repos/{owner}/{repo}/issues",
          {
            owner,
            repo,
            title,
            body,
            assignees,
            labels,
          }
        );

        return makeMCPToolTextSuccess({
          message: `Issue created: #${issue.number}`,
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error creating GitHub issue: ${normalizeError(e).message}`
        );
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
    async ({ owner, repo, pullNumber }, { authInfo }) => {
      const accessToken = authInfo?.token;

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
              author: n.commit.author.user?.login || "unknown",
            };
          }
        );
        const pullComments = pull.repository.pullRequest.comments.nodes.map(
          (n) => {
            return {
              createdAt: new Date(n.createdAt).getTime(),
              author: n.author?.login || "unknown",
              body: n.body,
            };
          }
        );
        const pullReviews = pull.repository.pullRequest.reviews.nodes.map(
          (n) => {
            return {
              createdAt: new Date(n.createdAt).getTime(),
              author: n.author?.login || "unknown",
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

        // Transforms the diff to inject positions for each lines in the sense of the github pull
        // request review comments definition.
        const diffWithPositions = (diff: string) => {
          const lines = diff.split("\n");

          // First pass: calculate global max position
          let currentFile = null;
          let position = 0;
          let globalMaxPosition = 0;

          for (const line of lines) {
            if (line.startsWith("diff --git")) {
              currentFile = null;
              position = 0;
              continue;
            }

            if (line.startsWith("@@")) {
              position = 0;
              continue;
            }

            if (currentFile !== null) {
              position++;
              globalMaxPosition = Math.max(position, globalMaxPosition);
            } else if (line.startsWith("+++")) {
              currentFile = line.substring(4).trim();
            }
          }

          // Second pass: add positions with consistent space padding
          const result = [];
          currentFile = null;
          position = 0;
          const digits = globalMaxPosition.toString().length;

          for (const line of lines) {
            if (line.startsWith("diff --git")) {
              currentFile = null;
              position = 0;
              result.push(line);
              continue;
            }

            if (currentFile !== null) {
              const paddedPosition = position.toString().padStart(digits, " ");
              if (line.startsWith("@@")) {
                result.push(line);
              } else {
                result.push(`[${paddedPosition}] ${line}`);
              }
              position++;
            } else {
              result.push(line);
              if (line.startsWith("+++")) {
                currentFile = line.substring(4).trim();
              }
            }
          }

          return result.join("\n");
        };

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
        const pullDiff = diffWithPositions(diff.data as string);

        const content =
          `TITLE: ${pullTitle}\n\n` +
          `BODY:\n` +
          `${pullBody}\n\n` +
          `COMMITS:\n` +
          `${(pullCommits || [])
            .map((c) => `${c.sha} ${c.author}: ${c.message}`)
            .join("\n")}\n\n` +
          `DIFF (lines are prepended by diff file positions):\n` +
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

        return makeMCPToolTextSuccess({
          message: `Retrieved pull request #${pullNumber}`,
          result: content,
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error retrieving GitHub pull request: ${normalizeError(e).message}`
        );
      }
    }
  );

  server.tool(
    "create_pull_request_review",
    "Create a review on a pull request with optional line comments.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      pullNumber: z
        .number()
        .describe("The number that identifies the pull request."),
      body: z.string().describe("The body text of the review."),
      event: z
        .enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"])
        .describe(
          "The review action you want to perform. The review actions include: APPROVE, REQUEST_CHANGES, or COMMENT."
        ),
      comments: z
        .array(
          z.object({
            path: z
              .string()
              .describe(
                "The relative path to the file that necessitates a review comment."
              ),
            position: z
              .number()
              .optional()
              .describe(
                "The position in the diff to add a review comment as prepended in " +
                  "the diff retrieved by `get_pull_request`"
              ),
            body: z.string().describe("The text of the review comment."),
          })
        )
        .describe("File comments to leave as part of the review.")
        .optional(),
    },
    async (
      { owner, repo, pullNumber, body, event, comments = [] },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;

      const octokit = new Octokit({ auth: accessToken });

      try {
        const { data: review } = await octokit.request(
          "POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews",
          {
            owner,
            repo,
            pull_number: pullNumber,
            body,
            event,
            comments,
          }
        );

        return makeMCPToolTextSuccess({
          message: `Review created with ID ${review.id}`,
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error reviewing GitHub pull request: ${normalizeError(e).message}`
        );
      }
    }
  );

  server.tool(
    "list_organization_projects",
    "List the open projects of a GitHub organization along with their single select fields (generally used as columns)",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
    },
    async ({ owner }, { authInfo }) => {
      const accessToken = authInfo?.token;

      const octokit = new Octokit({ auth: accessToken });

      try {
        const projectsQuery = `
        query($owner: String!) {
          organization(login: $owner) {
            projectsV2(first: 100) {
              nodes {
                id
                title
                shortDescription
                url
                closed
                fields(first: 100) {
                  nodes {
                    ... on ProjectV2SingleSelectField {
                      id
                      name
                      options {
                        id
                        name
                      }
                    }
                  }
                }
              }
            }
          }
        }`;

        const results = (await octokit.graphql(projectsQuery, {
          owner,
        })) as {
          organization: {
            projectsV2: {
              nodes: {
                id: string;
                title: string;
                shortDescription: string | null;
                url: string;
                closed: boolean;
                fields: {
                  nodes: {
                    id: string;
                    name: string;
                    options: {
                      id: string;
                      name: string;
                    }[];
                  }[];
                };
              }[];
            };
          };
        };

        const projects = results.organization.projectsV2.nodes
          .filter((project: any) => !project.closed)
          .map((project) => ({
            ...project,
            fields: {
              nodes: project.fields.nodes.filter((n) => n.id),
            },
          }));

        let content = "";
        projects.forEach((project) => {
          content +=
            `project='${project.title}' node_id=${project.id} ` +
            `description='${project.shortDescription}'\n`;
          project.fields.nodes.forEach((field) => {
            content += `  field='${field.name}' node_id=${field.id}\n`;
            field.options.forEach((o) => {
              content += `    option='${o.name}' node_id=${o.id}\n`;
            });
          });
          content += "\n";
        });

        if (!content) {
          return makeMCPToolTextSuccess({
            message: "No open projects found",
          });
        }

        return makeMCPToolTextSuccess({
          message: `Retrieved ${projects.length} open projects`,
          result: content,
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error retrieving GitHub repository projects: ${normalizeError(e).message}`
        );
      }
    }
  );

  server.tool(
    "add_issue_to_project",
    "Add an existing issue to a GitHub project, optionally setting a field value.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      issueNumber: z
        .number()
        .describe("The issue number to add to the project."),
      projectId: z
        .string()
        .describe("The node ID of the GitHub project (GraphQL ID)."),
      field: z
        .object({
          fieldId: z
            .string()
            .describe("The node ID of the field to update (GraphQL ID)."),
          optionId: z
            .string()
            .describe(
              "The node ID of the option to update the field to (GraphQL ID)."
            ),
        })
        .optional()
        .describe(
          "Optional field configuration with both fieldId and optionId required if provided."
        ),
    },
    async ({ owner, repo, issueNumber, projectId, field }, { authInfo }) => {
      const accessToken = authInfo?.token;

      const octokit = new Octokit({ auth: accessToken });

      try {
        // First, get the issue's node ID using GraphQL.
        const issueQuery = `
        query($owner: String!, $repo: String!, $issueNumber: Int!) {
          repository(owner: $owner, name: $repo) {
            issue(number: $issueNumber) {
              id
            }
          }
        }`;

        const issue = (await octokit.graphql(issueQuery, {
          owner,
          repo,
          issueNumber,
        })) as {
          repository: {
            issue: {
              id: string;
            };
          };
        };

        // Add the issue to the project using GraphQL mutation.
        const addToProjectMutation = `
          mutation($projectId: ID!, $contentId: ID!) {
            addProjectV2ItemById(input: {
              projectId: $projectId
              contentId: $contentId
            }) {
              item {
                id
              }
            }
          }`;

        const item = (await octokit.graphql(addToProjectMutation, {
          projectId,
          contentId: issue.repository.issue.id,
        })) as {
          addProjectV2ItemById: {
            item: {
              id: string;
            };
          };
        };

        if (field) {
          // Mutation to update the field value to specified option.
          const updateFieldMutation = `
          mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String) {
            updateProjectV2ItemFieldValue(input: {
              projectId: $projectId,
              itemId: $itemId,
              fieldId: $fieldId,
              value: {
                singleSelectOptionId: $optionId
              }
            }) {
              projectV2Item {
                id
              }
            }
          }`;

          await octokit.graphql(updateFieldMutation, {
            projectId,
            itemId: item.addProjectV2ItemById.item.id,
            fieldId: field.fieldId,
            optionId: field.optionId,
          });
        }

        return makeMCPToolTextSuccess({
          message: `Issue #${issueNumber} added to project`,
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error adding GitHub issue to project: ${normalizeError(e).message}`
        );
      }
    }
  );

  server.tool(
    "comment_on_issue",
    "Add a comment to an existing GitHub issue.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      issueNumber: z.number().describe("The issue number."),
      body: z
        .string()
        .describe("The contents of the comment (GitHub markdown)."),
    },
    async ({ owner, repo, issueNumber, body }, { authInfo }) => {
      const accessToken = authInfo?.token;

      const octokit = new Octokit({ auth: accessToken });

      try {
        const { data: comment } = await octokit.request(
          "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
          {
            owner,
            repo,
            issue_number: issueNumber,
            body,
          }
        );

        return makeMCPToolTextSuccess({
          message: `Comment added to issue #${issueNumber} with ID ${comment.id}`,
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error commenting on GitHub issue: ${normalizeError(e).message}`
        );
      }
    }
  );

  server.tool(
    "get_issue",
    "Retrieve an issue from a specified GitHub repository including its description, comments, and labels.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      issueNumber: z.number().describe("The issue number."),
    },
    async ({ owner, repo, issueNumber }, { authInfo }) => {
      const accessToken = authInfo?.token;

      const octokit = new Octokit({ auth: accessToken });

      try {
        const query = `
          query($owner: String!, $repo: String!, $issueNumber: Int!) {
            repository(owner: $owner, name: $repo) {
              issue(number: $issueNumber) {
                title
                body
                state
                createdAt
                updatedAt
                author {
                  login
                }
                labels(first: 100) {
                  nodes {
                    name
                    color
                  }
                }
                assignees(first: 100) {
                  nodes {
                    login
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
              }
            }
          }`;

        const issue = (await octokit.graphql(query, {
          owner,
          repo,
          issueNumber,
        })) as {
          repository: {
            issue: {
              title: string;
              body: string;
              state: string;
              createdAt: string;
              updatedAt: string;
              author: {
                login: string;
              };
              labels: {
                nodes: {
                  name: string;
                  color: string;
                }[];
              };
              assignees: {
                nodes: {
                  login: string;
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
            };
          };
        };

        const issueData = issue.repository.issue;
        const formattedIssue = {
          title: issueData.title,
          body: issueData.body,
          state: issueData.state,
          createdAt: issueData.createdAt,
          updatedAt: issueData.updatedAt,
          author: issueData.author.login,
          labels: issueData.labels.nodes.map((label) => ({
            name: label.name,
            color: label.color,
          })),
          assignees: issueData.assignees.nodes.map(
            (assignee) => assignee.login
          ),
          comments: issueData.comments.nodes.map((comment) => ({
            author: comment.author.login,
            body: comment.body,
            createdAt: comment.createdAt,
          })),
        };

        return makeMCPToolTextSuccess({
          message: `Retrieved issue #${issueNumber}`,
          result: JSON.stringify(formattedIssue, null, 2),
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error retrieving GitHub issue: ${normalizeError(e).message}`
        );
      }
    }
  );

  server.tool(
    "list_issues",
    "List issues from a specified GitHub repository with optional filtering.",
    {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      state: z
        .enum(["OPEN", "CLOSED", "ALL"])
        .optional()
        .describe("Filter issues by state. Defaults to OPEN."),
      labels: z
        .array(z.string())
        .optional()
        .describe("Filter issues by labels."),
      sort: z
        .enum(["CREATED_AT", "UPDATED_AT", "COMMENTS"])
        .optional()
        .describe("What to sort results by. Defaults to CREATED_AT."),
      direction: z
        .enum(["ASC", "DESC"])
        .optional()
        .describe("The direction of the sort. Defaults to DESC."),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Results per page. Defaults to 30, max 100."),
    },
    async (
      {
        owner,
        repo,
        state = "OPEN",
        labels,
        sort = "CREATED_AT",
        direction = "DESC",
        perPage = 30,
      },
      { authInfo }
    ) => {
      const accessToken = authInfo?.token;

      const octokit = new Octokit({ auth: accessToken });

      try {
        const query = `
          query($owner: String!, $repo: String!, $first: Int!, $orderBy: IssueOrder, $states: [IssueState!], $labels: [String!]) {
            repository(owner: $owner, name: $repo) {
              issues(first: $first, orderBy: $orderBy, states: $states, labels: $labels) {
                nodes {
                  number
                  title
                  state
                  createdAt
                  updatedAt
                  author {
                    login
                  }
                  labels(first: 10) {
                    nodes {
                      name
                      color
                    }
                  }
                  assignees(first: 10) {
                    nodes {
                      login
                    }
                  }
                  comments {
                    totalCount
                  }
                }
              }
            }
          }`;

        const issues = (await octokit.graphql(query, {
          owner,
          repo,
          first: perPage,
          orderBy: {
            field: sort,
            direction: direction,
          },
          states: state === "ALL" ? undefined : [state],
          labels: labels,
        })) as {
          repository: {
            issues: {
              nodes: {
                number: number;
                title: string;
                state: string;
                createdAt: string;
                updatedAt: string;
                author: {
                  login: string;
                };
                labels: {
                  nodes: {
                    name: string;
                    color: string;
                  }[];
                };
                assignees: {
                  nodes: {
                    login: string;
                  }[];
                };
                comments: {
                  totalCount: number;
                };
              }[];
            };
          };
        };

        const formattedIssues = issues.repository.issues.nodes.map((issue) => ({
          number: issue.number,
          title: issue.title,
          state: issue.state,
          createdAt: issue.createdAt,
          updatedAt: issue.updatedAt,
          author: issue.author.login,
          labels: issue.labels.nodes.map((label) => ({
            name: label.name,
            color: label.color,
          })),
          assignees: issue.assignees.nodes.map((assignee) => assignee.login),
          commentCount: issue.comments.totalCount,
        }));

        return makeMCPToolTextSuccess({
          message: `Retrieved ${formattedIssues.length} issues`,
          result: JSON.stringify(formattedIssues, null, 2),
        });
      } catch (e) {
        return makeMCPToolTextError(
          `Error listing GitHub issues: ${normalizeError(e).message}`
        );
      }
    }
  );

  return server;
};

export default createServer;
