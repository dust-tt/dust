import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createGithubTools } from "@app/lib/api/actions/servers/github/tools";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { graphqlMock } = vi.hoisted(() => ({
  graphqlMock: vi.fn(),
}));

vi.mock("@octokit/core", () => ({
  Octokit: class {
    graphql = graphqlMock;
  },
}));

const pageInfo = {
  hasNextPage: false,
  endCursor: null,
  startCursor: null,
  hasPreviousPage: false,
};

const pullRequest = {
  number: 1,
  title: "Team review",
  state: "OPEN",
  createdAt: "2026-07-22T00:00:00Z",
  updatedAt: "2026-07-22T00:00:00Z",
  mergedAt: null,
  closedAt: null,
  author: { login: "octocat" },
  baseRefName: "main",
  headRefName: "feature",
  additions: 1,
  deletions: 0,
  changedFiles: 1,
  labels: { nodes: [] },
  assignees: { nodes: [] },
  comments: { totalCount: 0 },
  reviews: { totalCount: 0 },
};

const searchResponse = {
  search: {
    issueCount: 1,
    pageInfo,
    nodes: [
      {
        ...pullRequest,
        __typename: "PullRequest",
        body: "",
        url: "https://github.com/dust-tt/dust/pull/1",
        repository: { owner: { login: "dust-tt" }, name: "dust" },
      },
    ],
  },
};

const listResponse = {
  repository: {
    pullRequests: {
      pageInfo,
      nodes: [pullRequest],
    },
  },
};

describe("GitHub pull request tools", () => {
  beforeEach(() => {
    graphqlMock.mockReset();
  });

  it.each([
    ["search_advanced", { query: "is:pr" }, searchResponse],
    ["list_pull_requests", { owner: "dust-tt", repo: "dust" }, listResponse],
  ])(
    "retries %s without review requests when GitHub denies team details",
    async (toolName, params, response) => {
      const reviewerAccessError = Object.assign(
        new Error("Resource not accessible by integration"),
        {
          errors: [
            {
              type: "FORBIDDEN",
              path: [
                "repository",
                "pullRequests",
                "nodes",
                0,
                "reviewRequests",
                "nodes",
                0,
                "requestedReviewer",
                "slug",
              ],
            },
          ],
        }
      );
      graphqlMock.mockRejectedValueOnce(reviewerAccessError);
      graphqlMock.mockResolvedValueOnce(response);

      const { authenticator } = await createResourceTest({ role: "admin" });
      const tool = createGithubTools(authenticator).find(
        ({ name }) => name === toolName
      );
      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      const extra: Omit<ToolHandlerExtra, "runContext"> = {
        auth: authenticator,
        authInfo: {
          token: "github-token",
          clientId: "github-client",
          scopes: [],
        },
        requestId: "github-reviewer-test",
        sendNotification: async () => {},
        sendRequest: async () => {
          throw new Error("Unexpected MCP request");
        },
        signal: new AbortController().signal,
      };

      // @ts-expect-error These handlers do not read runContext.
      const result = await tool.handler(params, extra);

      expect(result.isOk()).toBe(true);
      expect(graphqlMock).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining(
          "reviewRequests(first: 10) @include(if: $includeReviewRequests)"
        ),
        expect.objectContaining({ includeReviewRequests: true })
      );
      expect(graphqlMock).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining(
          "reviewRequests(first: 10) @include(if: $includeReviewRequests)"
        ),
        expect.objectContaining({ includeReviewRequests: false })
      );
      if (result.isOk()) {
        expect(result.value[1]).toMatchObject({
          type: "text",
          text: expect.stringContaining('"reviewRequests": []'),
        });
      }
    }
  );
});
