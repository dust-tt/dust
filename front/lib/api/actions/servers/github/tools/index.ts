import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolDefinition,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { GITHUB_TOOLS_METADATA } from "@app/lib/api/actions/servers/github/metadata";
import type { Authenticator } from "@app/lib/auth";
import { isWorkspaceUsingStaticIP } from "@app/lib/misc";
import { Err, Ok } from "@app/types/shared/result";
import { EnvironmentConfig } from "@app/types/shared/utils/config";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import { Octokit } from "@octokit/core";
import type {
  RequestInfo as UndiciRequestInfo,
  RequestInit as UndiciRequestInit,
} from "undici";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const GITHUB_GET_PULL_REQUEST_ACTION_MAX_COMMITS = 32;

export const createOctokit = async (
  auth: Authenticator,
  { accessToken }: { accessToken?: string }
) => {
  if (isWorkspaceUsingStaticIP(auth.getNonNullableWorkspace())) {
    const myFetch = (url: UndiciRequestInfo, options: UndiciRequestInit) =>
      undiciFetch(url, {
        ...options,
        dispatcher: new ProxyAgent(
          `http://${EnvironmentConfig.getEnvVariable(
            "PROXY_USER_NAME"
          )}:${EnvironmentConfig.getEnvVariable(
            "PROXY_USER_PASSWORD"
          )}@${EnvironmentConfig.getEnvVariable(
            "PROXY_HOST"
          )}:${EnvironmentConfig.getEnvVariable("PROXY_PORT")}`
        ),
      });
    return new Octokit({
      auth: accessToken,
      request: { fetch: myFetch },
    });
  }

  return new Octokit({
    auth: accessToken,
  });
};

export function createGithubTools(auth: Authenticator): ToolDefinition[] {
  const handlers: ToolHandlers<typeof GITHUB_TOOLS_METADATA> = {
    create_issue: async (
      { owner, repo, title, body, assignees, labels },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

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

        return new Ok([
          { type: "text" as const, text: `Issue created: #${issue.number}` },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error creating GitHub issue: ${normalizeError(e).message}`
          )
        );
      }
    },

    get_pull_request: async ({ owner, repo, pullNumber }, { authInfo }) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

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

        const diffWithPositions = (diff: string) => {
          const lines = diff.split("\n");

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

        return new Ok([
          {
            type: "text" as const,
            text: `Retrieved pull request #${pullNumber}`,
          },
          { type: "text" as const, text: JSON.stringify(content, null, 2) },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error retrieving GitHub pull request: ${normalizeError(e).message}`
          )
        );
      }
    },

    create_pull_request_review: async (
      { owner, repo, pullNumber, body, event, comments = [] },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

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

        return new Ok([
          {
            type: "text" as const,
            text: `Review created with ID ${review.id}`,
          },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error reviewing GitHub pull request: ${normalizeError(e).message}`
          )
        );
      }
    },

    list_organization_projects: async ({ owner }, { authInfo }) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

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
          return new Ok([
            { type: "text" as const, text: "No open projects found" },
          ]);
        }

        return new Ok([
          {
            type: "text" as const,
            text: `Retrieved ${projects.length} open projects`,
          },
          { type: "text" as const, text: JSON.stringify(content, null, 2) },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error retrieving GitHub repository projects: ${normalizeError(e).message}`
          )
        );
      }
    },

    add_issue_to_project: async (
      { owner, repo, issueNumber, projectId, field },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

      try {
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

        return new Ok([
          {
            type: "text" as const,
            text: `Issue #${issueNumber} added to project`,
          },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error adding GitHub issue to project: ${normalizeError(e).message}`
          )
        );
      }
    },

    comment_on_issue: async (
      { owner, repo, issueNumber, body },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

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

        return new Ok([
          {
            type: "text" as const,
            text: `Comment added to issue #${issueNumber} with ID ${comment.id}`,
          },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error commenting on GitHub issue: ${normalizeError(e).message}`
          )
        );
      }
    },

    get_issue: async ({ owner, repo, issueNumber }, { authInfo }) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

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

        return new Ok([
          { type: "text" as const, text: `Retrieved issue #${issueNumber}` },
          {
            type: "text" as const,
            text: JSON.stringify(formattedIssue, null, 2),
          },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error retrieving GitHub issue: ${normalizeError(e).message}`
          )
        );
      }
    },

    get_issue_custom_fields: async (
      { owner, repo, issueNumber, projectId },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

      // Helper function to format field values
      const formatFieldValues = (
        fieldValues: Array<{
          field?: {
            name: string;
            id: string;
          };
          text?: string;
          name?: string;
          number?: number;
          date?: string;
          title?: string;
          startDate?: string;
          duration?: number;
        }>
      ) => {
        return fieldValues.map((fieldValue) => {
          if (!fieldValue.field) {
            return null;
          }
          const fieldName = fieldValue.field.name;
          let value: string | number | null = null;
          let valueType = "unknown";

          if ("text" in fieldValue && fieldValue.text !== undefined) {
            value = fieldValue.text;
            valueType = "text";
          } else if ("name" in fieldValue && fieldValue.name !== undefined) {
            value = fieldValue.name;
            valueType = "singleSelect";
          } else if (
            "number" in fieldValue &&
            fieldValue.number !== undefined
          ) {
            value = fieldValue.number;
            valueType = "number";
          } else if ("date" in fieldValue && fieldValue.date !== undefined) {
            value = fieldValue.date;
            valueType = "date";
          } else if ("title" in fieldValue && fieldValue.title !== undefined) {
            value = fieldValue.title;
            valueType = "iteration";
          }

          return {
            fieldId: fieldValue.field.id,
            fieldName,
            value,
            valueType,
          };
        });
      };

      try {
        // First, get the issue ID and project items
        const issueQuery = `
          query($owner: String!, $repo: String!, $issueNumber: Int!) {
            repository(owner: $owner, name: $repo) {
              issue(number: $issueNumber) {
                id
                number
                title
                projectItems(first: 100) {
                  nodes {
                    id
                    project {
                      id
                      title
                    }
                    fieldValues(first: 100) {
                      nodes {
                        ... on ProjectV2ItemFieldTextValue {
                          field {
                            ... on ProjectV2FieldCommon {
                              name
                              id
                            }
                          }
                          text
                        }
                        ... on ProjectV2ItemFieldSingleSelectValue {
                          field {
                            ... on ProjectV2FieldCommon {
                              name
                              id
                            }
                          }
                          name
                        }
                        ... on ProjectV2ItemFieldNumberValue {
                          field {
                            ... on ProjectV2FieldCommon {
                              name
                              id
                            }
                          }
                          number
                        }
                        ... on ProjectV2ItemFieldDateValue {
                          field {
                            ... on ProjectV2FieldCommon {
                              name
                              id
                            }
                          }
                          date
                        }
                        ... on ProjectV2ItemFieldIterationValue {
                          field {
                            ... on ProjectV2FieldCommon {
                              name
                              id
                            }
                          }
                          title
                          startDate
                          duration
                        }
                      }
                    }
                  }
                }
              }
            }
          }`;

        const issueResult = (await octokit.graphql(issueQuery, {
          owner,
          repo,
          issueNumber,
        })) as {
          repository: {
            issue: {
              id: string;
              number: number;
              title: string;
              projectItems: {
                nodes: Array<{
                  id: string;
                  project: {
                    id: string;
                    title: string;
                  };
                  fieldValues: {
                    nodes: Array<{
                      field: {
                        name: string;
                        id: string;
                      };
                      text?: string;
                      name?: string;
                      number?: number;
                      date?: string;
                      title?: string;
                      startDate?: string;
                      duration?: number;
                    }>;
                  };
                }>;
              };
            } | null;
          };
        };

        if (!issueResult.repository.issue) {
          return new Err(
            new MCPError(`Issue #${issueNumber} not found in ${owner}/${repo}`)
          );
        }

        const issue = issueResult.repository.issue;
        const projectItems = issue.projectItems.nodes;

        // If projectId is specified, filter to that project only
        let filteredProjectItems = projectItems;
        if (projectId) {
          filteredProjectItems = projectItems.filter(
            (item) => item.project.id === projectId
          );

          if (filteredProjectItems.length === 0) {
            // Try to get project title for better error message
            const projectQuery = `
              query($projectId: ID!) {
                node(id: $projectId) {
                  ... on ProjectV2 {
                    title
                  }
                }
              }`;

            try {
              const projectResult = (await octokit.graphql(projectQuery, {
                projectId,
              })) as {
                node: {
                  title: string;
                } | null;
              };

              const projectTitle =
                projectResult.node?.title ?? `Project ${projectId}`;
              return new Ok([
                {
                  type: "text" as const,
                  text: `Issue #${issueNumber} is not in project "${projectTitle}"`,
                },
                {
                  type: "text" as const,
                  text: JSON.stringify({ customFields: [] }, null, 2),
                },
              ]);
            } catch {
              return new Err(
                new MCPError(
                  `Issue #${issueNumber} is not in the specified project, or project not found`
                )
              );
            }
          }
        }

        // Format results grouped by project
        const projectsWithFields = filteredProjectItems.map((item) => {
          return {
            projectId: item.project.id,
            projectTitle: item.project.title,
            customFields: removeNulls(
              formatFieldValues(item.fieldValues.nodes)
            ),
          };
        });

        if (
          projectsWithFields.filter((p) => p.customFields.length > 0).length ===
          0
        ) {
          return new Ok([
            {
              type: "text" as const,
              text: `Issue #${issueNumber} is not in any projects with custom fields`,
            },
            {
              type: "text" as const,
              text: JSON.stringify({ projects: [] }, null, 2),
            },
          ]);
        }

        const resultMessage =
          projectId && projectsWithFields.length > 0
            ? `Retrieved custom fields for issue #${issueNumber} in project "${projectsWithFields[0].projectTitle}"`
            : `Retrieved custom fields for issue #${issueNumber} across ${projectsWithFields.length} project(s)`;

        return new Ok([
          {
            type: "text" as const,
            text: resultMessage,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                issueNumber,
                projects: projectsWithFields,
              },
              null,
              2
            ),
          },
        ]);
      } catch (e) {
        const error = normalizeError(e);
        // Handle case where projectItems field might not be available
        if (
          error.message.includes("projectItems") ||
          error.message.includes("Cannot query field")
        ) {
          // Fallback: if projectItems is not available, try the project-specific query
          if (projectId) {
            try {
              // Get issue ID first
              const issueQuery = `
                query($owner: String!, $repo: String!, $issueNumber: Int!) {
                  repository(owner: $owner, name: $repo) {
                    issue(number: $issueNumber) {
                      id
                      number
                      title
                    }
                  }
                }`;

              const issueResult = (await octokit.graphql(issueQuery, {
                owner,
                repo,
                issueNumber,
              })) as {
                repository: {
                  issue: {
                    id: string;
                    number: number;
                    title: string;
                  } | null;
                };
              };

              if (!issueResult.repository.issue) {
                return new Err(
                  new MCPError(
                    `Issue #${issueNumber} not found in ${owner}/${repo}`
                  )
                );
              }

              const issueId = issueResult.repository.issue.id;

              // Query the specific project
              const projectQuery = `
                query($projectId: ID!) {
                  node(id: $projectId) {
                    ... on ProjectV2 {
                      title
                      items(first: 100) {
                        nodes {
                          id
                          content {
                            ... on Issue {
                              id
                              number
                            }
                          }
                          fieldValues(first: 100) {
                            nodes {
                              ... on ProjectV2ItemFieldTextValue {
                                field {
                                  ... on ProjectV2FieldCommon {
                                    name
                                    id
                                  }
                                }
                                text
                              }
                              ... on ProjectV2ItemFieldSingleSelectValue {
                                field {
                                  ... on ProjectV2FieldCommon {
                                    name
                                    id
                                  }
                                }
                                name
                              }
                              ... on ProjectV2ItemFieldNumberValue {
                                field {
                                  ... on ProjectV2FieldCommon {
                                    name
                                    id
                                  }
                                }
                                number
                              }
                              ... on ProjectV2ItemFieldDateValue {
                                field {
                                  ... on ProjectV2FieldCommon {
                                    name
                                    id
                                  }
                                }
                                date
                              }
                              ... on ProjectV2ItemFieldIterationValue {
                                field {
                                  ... on ProjectV2FieldCommon {
                                    name
                                    id
                                  }
                                }
                                title
                                startDate
                                duration
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }`;

              const projectResult = (await octokit.graphql(projectQuery, {
                projectId,
              })) as {
                node: {
                  title: string;
                  items: {
                    nodes: Array<{
                      id: string;
                      content: {
                        id: string;
                        number: number;
                      } | null;
                      fieldValues: {
                        nodes: Array<{
                          field: {
                            name: string;
                            id: string;
                          };
                          text?: string;
                          name?: string;
                          number?: number;
                          date?: string;
                          title?: string;
                          startDate?: string;
                          duration?: number;
                        }>;
                      };
                    }>;
                  };
                } | null;
              };

              if (!projectResult.node) {
                return new Err(
                  new MCPError(`Project with ID ${projectId} not found`)
                );
              }

              const projectItem = projectResult.node.items.nodes.find(
                (item) => item.content?.id === issueId
              );

              if (!projectItem) {
                return new Ok([
                  {
                    type: "text" as const,
                    text: `Issue #${issueNumber} is not in project "${projectResult.node.title}"`,
                  },
                  {
                    type: "text" as const,
                    text: JSON.stringify({ customFields: [] }, null, 2),
                  },
                ]);
              }

              const customFields = removeNulls(
                formatFieldValues(projectItem.fieldValues.nodes)
              );

              return new Ok([
                {
                  type: "text" as const,
                  text: `Retrieved custom fields for issue #${issueNumber} in project "${projectResult.node.title}"`,
                },
                {
                  type: "text" as const,
                  text: JSON.stringify(
                    {
                      projectTitle: projectResult.node.title,
                      issueNumber,
                      customFields,
                    },
                    null,
                    2
                  ),
                },
              ]);
            } catch (fallbackError) {
              return new Err(
                new MCPError(
                  `Error retrieving GitHub issue custom fields: ${normalizeError(fallbackError).message}. Note: Querying all projects requires the projectItems field which may not be available on all GitHub plans.`
                )
              );
            }
          } else {
            return new Err(
              new MCPError(
                `Error retrieving GitHub issue custom fields: ${error.message}. Note: Querying all projects requires the projectItems field which may not be available on all GitHub plans. Please specify a projectId.`
              )
            );
          }
        }

        return new Err(
          new MCPError(
            `Error retrieving GitHub issue custom fields: ${error.message}`
          )
        );
      }
    },

    list_issues: async (
      {
        owner,
        repo,
        state = "OPEN",
        labels,
        sort = "CREATED_AT",
        direction = "DESC",
        perPage = 50,
        after,
        before,
      },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

      try {
        const query = `
          query($owner: String!, $repo: String!, $first: Int!, $orderBy: IssueOrder, $states: [IssueState!], $labels: [String!], $after: String, $before: String) {
            repository(owner: $owner, name: $repo) {
              issues(first: $first, orderBy: $orderBy, states: $states, labels: $labels, after: $after, before: $before) {
                pageInfo {
                  hasNextPage
                  endCursor
                  startCursor
                  hasPreviousPage
                }
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
          after: after,
          before: before,
          orderBy: {
            field: sort,
            direction: direction,
          },
          states: state === "ALL" ? undefined : [state],
          labels: labels,
        })) as {
          repository: {
            issues: {
              pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
                startCursor: string | null;
                hasPreviousPage: boolean;
              };
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
          assignees: issue.assignees.nodes.map((a) => a.login),
          commentCount: issue.comments.totalCount,
        }));

        return new Ok([
          {
            type: "text" as const,
            text: `Retrieved ${formattedIssues.length} issues`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                issues: formattedIssues,
                pageInfo: issues.repository.issues.pageInfo,
              },
              null,
              2
            ),
          },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error listing GitHub issues: ${normalizeError(e).message}`
          )
        );
      }
    },

    search_advanced: async (
      { query, first = 30, after, before },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

      try {
        const searchQuery = `
          query($searchQuery: String!, $first: Int!, $after: String, $before: String) {
            search(query: $searchQuery, type: ISSUE_ADVANCED, first: $first, after: $after, before: $before) {
              issueCount
              pageInfo {
                hasNextPage
                endCursor
                startCursor
                hasPreviousPage
              }
              nodes {
                ... on Issue {
                  __typename
                  number
                  title
                  body
                  state
                  createdAt
                  updatedAt
                  closedAt
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
                ... on PullRequest {
                  __typename
                  number
                  title
                  body
                  state
                  createdAt
                  updatedAt
                  mergedAt
                  closedAt
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
                  baseRefName
                  headRefName
                  additions
                  deletions
                  changedFiles
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
                  reviewRequests(first: 10) {
                    nodes {
                      requestedReviewer {
                        ... on User {
                          login
                        }
                        ... on Team {
                          slug
                        }
                      }
                    }
                  }
                  comments {
                    totalCount
                  }
                  reviews {
                    totalCount
                  }
                }
              }
            }
          }`;

        const results = (await octokit.graphql(searchQuery, {
          searchQuery: query,
          first,
          after,
          before,
        })) as {
          search: {
            issueCount: number;
            pageInfo: {
              hasNextPage: boolean;
              endCursor: string | null;
              startCursor: string | null;
              hasPreviousPage: boolean;
            };
            nodes: Array<
              | {
                  __typename: "Issue";
                  number: number;
                  title: string;
                  body: string;
                  state: string;
                  createdAt: string;
                  updatedAt: string;
                  closedAt: string | null;
                  url: string;
                  repository: {
                    owner: {
                      login: string;
                    };
                    name: string;
                  };
                  author: {
                    login: string;
                  };
                  labels: {
                    nodes: Array<{
                      name: string;
                      color: string;
                    }>;
                  };
                  assignees: {
                    nodes: Array<{
                      login: string;
                    }>;
                  };
                  comments: {
                    totalCount: number;
                  };
                }
              | {
                  __typename: "PullRequest";
                  number: number;
                  title: string;
                  body: string;
                  state: string;
                  createdAt: string;
                  updatedAt: string;
                  mergedAt: string | null;
                  closedAt: string | null;
                  url: string;
                  repository: {
                    owner: {
                      login: string;
                    };
                    name: string;
                  };
                  author: {
                    login: string;
                  };
                  baseRefName: string;
                  headRefName: string;
                  additions: number;
                  deletions: number;
                  changedFiles: number;
                  labels: {
                    nodes: Array<{
                      name: string;
                      color: string;
                    }>;
                  };
                  assignees: {
                    nodes: Array<{
                      login: string;
                    }>;
                  };
                  reviewRequests: {
                    nodes: Array<{
                      requestedReviewer: {
                        login?: string;
                        slug?: string;
                      } | null;
                    }>;
                  };
                  comments: {
                    totalCount: number;
                  };
                  reviews: {
                    totalCount: number;
                  };
                }
            >;
          };
        };

        const formattedResults = results.search.nodes.map((node) => {
          const base = {
            number: node.number,
            title: node.title,
            body: node.body,
            state: node.state,
            createdAt: node.createdAt,
            updatedAt: node.updatedAt,
            closedAt: node.closedAt,
            url: node.url,
            repository: `${node.repository.owner.login}/${node.repository.name}`,
            author: node.author.login,
            labels: node.labels.nodes.map((label) => ({
              name: label.name,
              color: label.color,
            })),
            assignees: node.assignees.nodes.map((a) => a.login),
            commentCount: node.comments.totalCount,
          };

          if (node.__typename === "PullRequest") {
            return {
              ...base,
              type: "pull_request" as const,
              mergedAt: node.mergedAt,
              baseRefName: node.baseRefName,
              headRefName: node.headRefName,
              additions: node.additions,
              deletions: node.deletions,
              changedFiles: node.changedFiles,
              reviewRequests: node.reviewRequests.nodes
                .map((request) => {
                  if (!request.requestedReviewer) {
                    return null;
                  }
                  return (
                    request.requestedReviewer.login ??
                    request.requestedReviewer.slug
                  );
                })
                .filter(Boolean),
              reviewCount: node.reviews.totalCount,
            };
          } else {
            return {
              ...base,
              type: "issue" as const,
            };
          }
        });

        const issues = formattedResults.filter((r) => r.type === "issue");
        const pullRequests = formattedResults.filter(
          (r) => r.type === "pull_request"
        );

        return new Ok([
          {
            type: "text" as const,
            text: `Found ${results.search.issueCount} total results (${issues.length} issues, ${pullRequests.length} pull requests), retrieved ${formattedResults.length} results`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalCount: results.search.issueCount,
                issues,
                pullRequests,
                results: formattedResults,
                pageInfo: results.search.pageInfo,
              },
              null,
              2
            ),
          },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error searching GitHub issues and pull requests: ${normalizeError(e).message}`
          )
        );
      }
    },

    list_pull_requests: async (
      {
        owner,
        repo,
        state = "OPEN",
        sort = "CREATED_AT",
        direction = "DESC",
        perPage = 30,
        after,
        before,
      },
      { authInfo }
    ) => {
      const octokit = await createOctokit(auth, {
        accessToken: authInfo?.token,
      });

      try {
        const query = `
          query($owner: String!, $repo: String!, $first: Int!, $orderBy: IssueOrder, $states: [PullRequestState!], $after: String, $before: String) {
            repository(owner: $owner, name: $repo) {
              pullRequests(first: $first, orderBy: $orderBy, states: $states, after: $after, before: $before) {
                pageInfo {
                  hasNextPage
                  endCursor
                  startCursor
                  hasPreviousPage
                }
                nodes {
                  number
                  title
                  state
                  createdAt
                  updatedAt
                  mergedAt
                  closedAt
                  author {
                    login
                  }
                  baseRefName
                  headRefName
                  additions
                  deletions
                  changedFiles
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
                  reviewRequests(first: 10) {
                    nodes {
                      requestedReviewer {
                        ... on User {
                          login
                        }
                        ... on Team {
                          slug
                        }
                      }
                    }
                  }
                  comments {
                    totalCount
                  }
                  reviews {
                    totalCount
                  }
                }
              }
            }
          }`;

        let graphqlStates;
        if (state === "ALL") {
          graphqlStates = undefined;
        } else if (state === "OPEN") {
          graphqlStates = ["OPEN"];
        } else if (state === "CLOSED") {
          graphqlStates = ["CLOSED"];
        } else if (state === "MERGED") {
          graphqlStates = ["MERGED"];
        }

        const pullRequests = (await octokit.graphql(query, {
          owner,
          repo,
          before,
          after,
          first: perPage,
          orderBy: {
            field: sort,
            direction: direction,
          },
          states: graphqlStates,
        })) as {
          repository: {
            pullRequests: {
              pageInfo: {
                hasNextPage: boolean;
                endCursor: string | null;
                startCursor: string | null;
                hasPreviousPage: boolean;
              };
              nodes: {
                number: number;
                title: string;
                state: string;
                createdAt: string;
                updatedAt: string;
                mergedAt: string | null;
                closedAt: string | null;
                author: {
                  login: string;
                };
                baseRefName: string;
                headRefName: string;
                additions: number;
                deletions: number;
                changedFiles: number;
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
                reviewRequests: {
                  nodes: {
                    requestedReviewer: {
                      login?: string;
                      slug?: string;
                    } | null;
                  }[];
                };
                comments: {
                  totalCount: number;
                };
                reviews: {
                  totalCount: number;
                };
              }[];
            };
          };
        };

        const formattedPullRequests =
          pullRequests.repository.pullRequests.nodes.map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            createdAt: pr.createdAt,
            updatedAt: pr.updatedAt,
            mergedAt: pr.mergedAt,
            closedAt: pr.closedAt,
            author: pr.author.login,
            baseRefName: pr.baseRefName,
            headRefName: pr.headRefName,
            additions: pr.additions,
            deletions: pr.deletions,
            changedFiles: pr.changedFiles,
            labels: pr.labels.nodes.map((label) => ({
              name: label.name,
              color: label.color,
            })),
            assignees: pr.assignees.nodes.map((assignee) => assignee.login),
            reviewRequests: pr.reviewRequests.nodes
              .map((request) => {
                if (!request.requestedReviewer) {
                  return null;
                }
                return (
                  request.requestedReviewer.login ??
                  request.requestedReviewer.slug
                );
              })
              .filter(Boolean),
            commentCount: pr.comments.totalCount,
            reviewCount: pr.reviews.totalCount,
          }));

        return new Ok([
          {
            type: "text" as const,
            text: `Retrieved ${formattedPullRequests.length} pull requests`,
          },
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                pullRequests: formattedPullRequests,
                pageInfo: pullRequests.repository.pullRequests.pageInfo,
              },
              null,
              2
            ),
          },
        ]);
      } catch (e) {
        return new Err(
          new MCPError(
            `Error listing GitHub pull requests: ${normalizeError(e).message}`
          )
        );
      }
    },
  };

  return buildTools(GITHUB_TOOLS_METADATA, handlers);
}
