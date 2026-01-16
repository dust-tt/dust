import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { defineToolMeta } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { MCPOAuthUseCase } from "@app/types";

export const GITHUB_TOOL_NAME = "github" as const;

export const createIssueMeta = defineToolMeta({
  name: "create_issue",
  description: "Create a new issue on a specified GitHub repository.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
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
});

export const getPullRequestMeta = defineToolMeta({
  name: "get_pull_request",
  description:
    "Retrieve a pull request from a specified GitHub repository including" +
    " its associated description, diff, comments and reviews.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
    repo: z.string().describe("The name of the repository."),
    pullNumber: z.number().describe("The pull request number."),
  },
  stake: "never_ask",
});

export const createPullRequestReviewMeta = defineToolMeta({
  name: "create_pull_request_review",
  description: "Create a review on a pull request with optional line comments.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
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
  stake: "low",
});

export const listOrganizationProjectsMeta = defineToolMeta({
  name: "list_organization_projects",
  description:
    "List the open projects of a GitHub organization along with their single select fields (generally used as columns)",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
  },
  stake: "never_ask",
});

export const addIssueToProjectMeta = defineToolMeta({
  name: "add_issue_to_project",
  description:
    "Add an existing issue to a GitHub project, optionally setting a field value.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
    repo: z.string().describe("The name of the repository."),
    issueNumber: z.number().describe("The issue number to add to the project."),
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
});

export const commentOnIssueMeta = defineToolMeta({
  name: "comment_on_issue",
  description: "Add a comment to an existing GitHub issue.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
    repo: z.string().describe("The name of the repository."),
    issueNumber: z.number().describe("The issue number."),
    body: z.string().describe("The contents of the comment (GitHub markdown)."),
  },
  stake: "low",
});

export const getIssueMeta = defineToolMeta({
  name: "get_issue",
  description:
    "Retrieve an issue from a specified GitHub repository including its description, comments, and labels.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
    repo: z.string().describe("The name of the repository."),
    issueNumber: z.number().describe("The issue number."),
  },
  stake: "never_ask",
});

export const listIssuesMeta = defineToolMeta({
  name: "list_issues",
  description:
    "List issues from a specified GitHub repository with optional filtering.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
    repo: z.string().describe("The name of the repository."),
    state: z
      .enum(["OPEN", "CLOSED", "ALL"])
      .optional()
      .describe("Filter issues by state. Defaults to OPEN."),
    labels: z.array(z.string()).optional().describe("Filter issues by labels."),
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
});

export const searchAdvancedMeta = defineToolMeta({
  name: "search_advanced",
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
});

export const listPullRequestsMeta = defineToolMeta({
  name: "list_pull_requests",
  description:
    "List pull requests from a specified GitHub repository with optional filtering.",
  schema: {
    owner: z
      .string()
      .describe("The owner of the repository (account or organization name)."),
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
});

export const TOOLS_META = [
  createIssueMeta,
  getPullRequestMeta,
  createPullRequestReviewMeta,
  listOrganizationProjectsMeta,
  addIssueToProjectMeta,
  commentOnIssueMeta,
  getIssueMeta,
  listIssuesMeta,
  searchAdvancedMeta,
  listPullRequestsMeta,
];

export const GITHUB_SERVER_INFO = {
  name: "github" as const,
  version: "1.0.0",
  description: "Manage issues and pull requests.",
  authorization: {
    provider: "github" as const,
    supported_use_cases: [
      "platform_actions",
      "personal_actions",
    ] as MCPOAuthUseCase[],
  },
  icon: "GithubLogo" as const,
  documentationUrl: null,
  instructions: null,
};

export const GITHUB_SERVER = {
  serverInfo: GITHUB_SERVER_INFO,
  tools: TOOLS_META.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
  })),
  tools_stakes: Object.fromEntries(TOOLS_META.map((t) => [t.name, t.stake])),
} as const satisfies ServerMetadata;
