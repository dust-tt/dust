import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { TagFactory } from "@app/tests/utils/TagFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchAgents = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/agents/search", () => ({
  searchAgents,
}));

function setup(role: MembershipRoleType = "user") {
  return createPrivateApiMockRequest({ role });
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
  editorIds: undefined,
  modelIds: undefined,
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
      new Ok({ agents: [agent], total: 30, hasMore: true })
    );

    const response = await searchRequest(workspace.sId, {
      query: "research",
      limit: 100,
      offset: 25,
    });

    expect(response.status).toBe(200);
    expect(searchAgents).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: 100,
      offset: 25,
      sortBy: undefined,
      sortOrder: undefined,
      permissionFiltering: undefined,
      facets: undefined,
      filters: noFilters,
    });
    expect(await response.json()).toEqual({
      hasMore: true,
      total: 30,
      facets: {},
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
      new Ok({ agents: [], total: 0, hasMore: false })
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
      offset: undefined,
      sortBy: "name",
      sortOrder: "desc",
      permissionFiltering: undefined,
      facets: undefined,
      filters,
    });
  });

  it.each([
    { limit: 0 },
    { limit: 101 },
    { offset: -1 },
    { offset: 1.5 },
    { offset: "25" },
    { permissionFiltering: "redact_unreadable" },
    { editedByMe: false },
    { sortBy: "unknown" },
    { sortOrder: "unknown" },
    { status: ["draft"] },
    { status: [] },
    { scope: ["private"] },
    { scope: [] },
    { tagIds: [""] },
    { editorIds: [""] },
    { modelIds: [""] },
    { facets: ["usage"] },
    { limit: -1 },
  ])("rejects invalid input: %s", async (body) => {
    const { workspace } = await setup();

    const response = await searchRequest(workspace.sId, body);

    expect(response.status).toBe(400);
    expect(searchAgents).not.toHaveBeenCalled();
  });

  it("passes unrestricted filtering through for admins", async () => {
    const { workspace } = await setup("admin");
    searchAgents.mockResolvedValue(
      new Ok({ agents: [], total: 0, hasMore: false })
    );

    const response = await searchRequest(workspace.sId, {
      permissionFiltering: "unrestricted",
    });

    expect(response.status).toBe(200);
    expect(searchAgents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ permissionFiltering: "unrestricted" })
    );
  });

  it("forbids unrestricted search for non-admins", async () => {
    const { workspace } = await setup();
    searchAgents.mockResolvedValue(new Err("unrestricted_requires_admin"));

    const response = await searchRequest(workspace.sId, {
      permissionFiltering: "unrestricted",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "app_auth_error" },
    });
  });

  it("returns facet values with editor and tag names", async () => {
    const { workspace, user } = await setup();
    const tag = await TagFactory.create(workspace, { name: "Sales" });
    searchAgents.mockResolvedValue(
      new Ok({
        agents: [],
        total: 0,
        hasMore: false,
        facets: {
          editors: [user.sId, "missing-user"],
          models: ["claude-sonnet-5"],
          tags: [tag.sId],
        },
      })
    );

    const response = await searchRequest(workspace.sId, {
      limit: 0,
      facets: ["editors", "models", "tags"],
    });

    expect(response.status).toBe(200);
    expect(searchAgents).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        limit: 0,
        facets: ["editors", "models", "tags"],
      })
    );
    expect((await response.json()).facets).toEqual({
      editors: [
        {
          sId: user.sId,
          fullName: user.toJSON().fullName,
          image: user.toJSON().image,
        },
      ],
      models: ["claude-sonnet-5"],
      tags: [{ sId: tag.sId, name: "Sales", kind: "standard" }],
    });
  });

  it("returns a bad request when the offset is out of range", async () => {
    const { workspace } = await setup();
    searchAgents.mockResolvedValue(new Err("offset_out_of_range"));

    const response = await searchRequest(workspace.sId, { offset: 9990 });

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
