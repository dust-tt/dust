import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const GITHUB_TOOL_NAME = "github" as const;

export const GITHUB_TOOLS_METADATA = createToolsRecord({
  create_issue: {
    description: "Create a new issue on a specified GitHub repository.",
    schema: {
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
    stake: "low",
    displayLabels: {
      running: "Creating GitHub issue",
      done: "Create GitHub issue",
    },
  },
  get_pull_request: {
    description:
      "Retrieve a pull request from a specified GitHub repository including" +
      " its associated description, diff, comments and reviews.",
    schema: {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      pullNumber: z.number().describe("The pull request number."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving GitHub pull request",
      done: "Retrieve GitHub pull request",
    },
  },
  create_pull_request_review: {
    description:
      "Create a review on a pull request with optional line comments.",
    schema: {
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
    stake: "high",
    displayLabels: {
      running: "Reviewing GitHub pull request",
      done: "Review GitHub pull request",
    },
  },
  list_organization_projects: {
    description:
      "List the open projects of a GitHub organization along with their single select fields (generally used as columns)",
    schema: {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing GitHub organization projects",
      done: "List GitHub organization projects",
    },
  },
  add_issue_to_project: {
    description:
      "Add an existing issue to a GitHub project, optionally setting a field value.",
    schema: {
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
    stake: "low",
    displayLabels: {
      running: "Adding GitHub issue to project",
      done: "Add GitHub issue to project",
    },
  },
  comment_on_issue: {
    description: "Add a comment to an existing GitHub issue.",
    schema: {
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
    stake: "low",
    displayLabels: {
      running: "Commenting on GitHub issue",
      done: "Comment on GitHub issue",
    },
  },
  get_issue: {
    description:
      "Retrieve an issue from a specified GitHub repository including its description, comments, and labels.",
    schema: {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      issueNumber: z.number().describe("The issue number."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving GitHub issue",
      done: "Retrieve GitHub issue",
    },
  },
  get_issue_custom_fields: {
    description:
      "Get custom fields set on an issue in GitHub project(s). If projectId is provided, returns custom fields for that specific project. If projectId is omitted, returns custom fields for all projects containing the issue.",
    schema: {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      issueNumber: z.number().describe("The issue number."),
      projectId: z
        .string()
        .optional()
        .describe(
          "Optional: The node ID of a specific GitHub project (GraphQL ID). If omitted, returns custom fields for all projects containing the issue."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving GitHub issue custom fields",
      done: "Retrieve GitHub issue custom fields",
    },
  },
  list_issues: {
    description:
      "List issues from a specified GitHub repository with optional filtering.",
    schema: {
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
        .describe("Results per page. Defaults to 50, max 100."),
      after: z.string().optional().describe("The cursor to start after."),
      before: z.string().optional().describe("The cursor to start before."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing GitHub issues",
      done: "List GitHub issues",
    },
  },
  search_advanced: {
    description:
      "Search issues and pull requests using GitHub's advanced search syntax with AND/OR operators and nested searches. " +
      "Supports advanced query syntax like 'is:issue AND assignee:@me AND (label:support OR comments:>5)' or 'is:pr AND assignee:@me'. " +
      "Use 'is:issue' to search for issues, 'is:pr' to search for pull requests, or omit to search both. ",
    schema: {
      query: z
        .string()
        .describe(
          "The advanced search query string. Supports AND/OR operators and nested searches. " +
            "Examples: 'is:issue AND assignee:username AND (label:bug OR comments:>5)', 'is:pr AND assignee:@me', or 'assignee:username' to search both. " +
            "Note: Spaces between multiple repo/org/user filters are treated as AND operators."
        ),
      first: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of results to return. Defaults to 30, max 100."),
      after: z.string().optional().describe("The cursor to start after."),
      before: z.string().optional().describe("The cursor to start before."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Searching GitHub issues and pull requests",
      done: "Search GitHub issues and pull requests",
    },
  },
  list_pull_requests: {
    description:
      "List pull requests from a specified GitHub repository with optional filtering.",
    schema: {
      owner: z
        .string()
        .describe(
          "The owner of the repository (account or organization name)."
        ),
      repo: z.string().describe("The name of the repository."),
      state: z
        .enum(["OPEN", "CLOSED", "MERGED", "ALL"])
        .optional()
        .describe("Filter pull requests by state. Defaults to OPEN."),
      sort: z
        .enum(["CREATED_AT", "UPDATED_AT"])
        .optional()
        .describe("What to sort results by. Defaults to CREATED_AT."),
      direction: z
        .enum(["ASC", "DESC"])
        .optional()
        .describe("The direction of the sort. Defaults to DESC."),
      perPage: z
        .number()
        .min(1)
        .max(65)
        .optional()
        .describe("Results per page. Defaults to 30, max 65."),
      after: z.string().optional().describe("The cursor to start after."),
      before: z.string().optional().describe("The cursor to start before."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing GitHub pull requests",
      done: "List GitHub pull requests",
    },
  },
});

export const GITHUB_SERVER = {
  serverInfo: {
    name: "github",
    version: "1.0.0",
    description: "Manage issues and pull requests.",
    authorization: {
      provider: "github",
      supported_use_cases: ["platform_actions", "personal_actions"],
    },
    icon: "GithubLogo",
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(GITHUB_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(GITHUB_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
