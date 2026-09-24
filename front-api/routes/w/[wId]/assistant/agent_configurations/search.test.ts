import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchAgents = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/agents/search", () => ({
  searchAgents,
}));

async function setup(role: MembershipRoleType = "user") {
  const context = await createPrivateApiMockRequest({ role });
  await FeatureFlagFactory.basic(context.auth, "agents_search");
  return context;
}

function searchRequest(
  workspaceId: string,
  body: Record<string, unknown> = {}
) {
  return honoApp.request(
    `/api/w/${workspaceId}/assistant/agent_configurations/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

const noFilters = {
  status: undefined,
  scope: undefined,
  tagIds: undefined,
  skillIds: undefined,
  mcpServerViewIds: undefined,
  editedByMe: undefined,
};

describe("POST /api/w/:wId/assistant/agent_configurations/search", () => {
  beforeEach(() => {
    searchAgents.mockReset();
  });

  it("rejects search when agents_search is disabled", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "user" });

    const response = await searchRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
    expect(searchAgents).not.toHaveBeenCalled();
  });

  it("routes search results with their deduplicated editors", async () => {
    const { workspace, user } = await setup();
    const agent = {
      sId: "search-result",
      status: "active",
      scope: "visible",
      name: "Search result",
      description: "Description",
      pictureUrl: "https://dust.tt/static/agent.png",
      requestedSpaceIds: [],
      tagIds: [],
      editorIds: [user.sId, user.sId, "missing-user"],
      editedBy: null,
      activeUsersCount: null,
      updatedAt: null,
    };
    searchAgents.mockResolvedValue(
      new Ok({ agents: [agent], hasMore: true, nextCursor: "opaque-cursor" })
    );

    const response = await searchRequest(workspace.sId, {
      query: "research",
      limit: 100,
      cursor: "previous-cursor",
    });

    expect(response.status).toBe(200);
    expect(searchAgents).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: 100,
      cursor: "previous-cursor",
      sortBy: undefined,
      sortOrder: undefined,
      filters: noFilters,
    });
    expect(await response.json()).toEqual({
      hasMore: true,
      nextCursor: "opaque-cursor",
      agents: [
        {
          ...agent,
          editors: [
            {
              sId: user.sId,
              fullName: user.toJSON().fullName,
              image: user.toJSON().image,
            },
          ],
        },
      ],
    });
  });

  it("accepts structured filters and sorts", async () => {
    const { workspace } = await setup();
    searchAgents.mockResolvedValue(
      new Ok({ agents: [], hasMore: false, nextCursor: null })
    );
    const filters = {
      status: ["active", "archived"],
      scope: ["hidden"],
      tagIds: ["tag"],
      skillIds: ["skill"],
      mcpServerViewIds: ["tool"],
      editedByMe: true,
    };

    const response = await searchRequest(workspace.sId, {
      ...filters,
      sortBy: "name",
      sortOrder: "desc",
    });

    expect(response.status).toBe(200);
    expect(searchAgents).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "",
      limit: undefined,
      cursor: undefined,
      sortBy: "name",
      sortOrder: "desc",
      filters,
    });
  });

  it.each([
    { limit: 0 },
    { limit: 101 },
    { cursor: [{}] },
    { editedByMe: false },
    { sortBy: "unknown" },
    { sortOrder: "unknown" },
    { status: ["draft"] },
    { status: [] },
    { scope: ["global"] },
    { tagIds: [""] },
  ])("rejects invalid input: %s", async (body) => {
    const { workspace } = await setup();

    const response = await searchRequest(workspace.sId, body);

    expect(response.status).toBe(400);
    expect(searchAgents).not.toHaveBeenCalled();
  });

  it("returns a bad request when search rejects the cursor", async () => {
    const { workspace } = await setup();
    searchAgents.mockResolvedValue(new Err("invalid_cursor"));

    const response = await searchRequest(workspace.sId, { cursor: "invalid" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("returns an internal error when Elasticsearch fails", async () => {
    const { workspace } = await setup();
    searchAgents.mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "Search failed"))
    );

    const response = await searchRequest(workspace.sId);

    expect(response.status).toBe(500);
    expect((await response.json()).error.type).toBe("internal_server_error");
  });
});
