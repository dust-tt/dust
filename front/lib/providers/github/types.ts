import { z } from "zod";

// Github REST API types
export interface GitHubSearchIssueItem {
  node_id: string;
  number: number;
  title: string;
  html_url: string;
  // The pull_request field exists on items that are pull requests
  // Its presence (not its value) is what matters for type discrimination
  pull_request?: {
    url: string | null;
    html_url: string | null;
    diff_url: string | null;
    patch_url: string | null;
  };
}

export interface GitHubSearchIssuesResponse {
  items: GitHubSearchIssueItem[];
}

// Client function parameter types
export interface GitHubSearchIssuesParams {
  accessToken: string;
  query: string; // search query entered by the user
  pageSize: number;
}

// Github GraphQL API types
export interface GitHubGraphQLNodeParams {
  accessToken: string;
  nodeId: string;
}

// Common schemas (both Issues and Pull Requests have these fields)
const GitHubAuthorSchema = z.object({
  login: z.string(),
});

const GitHubRepositorySchema = z.object({
  owner: z.object({
    login: z.string(),
  }),
  name: z.string(),
});

const GitHubCommentSchema = z.object({
  author: GitHubAuthorSchema,
  body: z.string(),
  createdAt: z.string(),
});

const GitHubCommentsSchema = z.object({
  nodes: z.array(GitHubCommentSchema),
});

// Issue schema
const GitHubIssueNodeSchema = z.object({
  __typename: z.literal("Issue"),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  url: z.string(),
  repository: GitHubRepositorySchema,
  author: GitHubAuthorSchema,
  comments: GitHubCommentsSchema,
});

// Pull Request schemas
const GitHubReviewSchema = z.object({
  author: GitHubAuthorSchema,
  body: z.string().nullable(),
  state: z.string(),
  createdAt: z.string(),
});

const GitHubReviewsSchema = z.object({
  nodes: z.array(GitHubReviewSchema),
});

const GitHubPullRequestNodeSchema = z.object({
  __typename: z.literal("PullRequest"),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  url: z.string(),
  repository: GitHubRepositorySchema,
  author: GitHubAuthorSchema,
  comments: GitHubCommentsSchema,
  reviews: GitHubReviewsSchema,
});

// Union of Issue and PullRequest
const GitHubNodeSchema = z.discriminatedUnion("__typename", [
  GitHubIssueNodeSchema,
  GitHubPullRequestNodeSchema,
]);

export const GitHubNodeQueryResponseSchema = z.object({
  node: GitHubNodeSchema,
});

export type GitHubIssueNode = z.infer<typeof GitHubIssueNodeSchema>;
export type GitHubPullRequestNode = z.infer<typeof GitHubPullRequestNodeSchema>;
export type GitHubNode = z.infer<typeof GitHubNodeSchema>;
export type GitHubNodeQueryResponse = z.infer<
  typeof GitHubNodeQueryResponseSchema
>;
