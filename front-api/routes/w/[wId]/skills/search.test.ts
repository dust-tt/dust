import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...actual,
    withEs: async (
      fn: (client: { search: typeof mockSearch }) => Promise<unknown>
    ) => new Ok(await fn({ search: mockSearch })),
  };
});

const originalSearch = SkillResource.search.bind(SkillResource);
const searchSkills = vi.spyOn(SkillResource, "search");

async function setup(role: MembershipRoleType = "user") {
  const context = await createPrivateApiMockRequest({ role });
  await FeatureFlagFactory.basic(context.auth, "skills_search");
  return context;
}

function searchRequest(
  workspaceId: string,
  body: Record<string, unknown> = {}
) {
  return honoApp.request(`/api/w/${workspaceId}/skills/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/skills/search", () => {
  beforeEach(() => {
    searchSkills.mockReset();
    mockSearch.mockReset();
  });

  it.each([
    "user",
    "admin",
  ] as const)("rejects search for a %s when skills_search is disabled", async (role) => {
    const { workspace } = await createPrivateApiMockRequest({ role });

    const response = await searchRequest(workspace.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { type: "feature_flag_not_found" },
    });
    expect(searchSkills).not.toHaveBeenCalled();
  });

  it.each([
    0,
    null,
  ])("routes search results with updatedAt=%s", async (updatedAt) => {
    const { auth, workspace, user } = await setup();
    const skill = await SkillFactory.create(auth, {
      name: "Search result",
      availability: "workspace_users",
      addCurrentUserAsEditor: false,
    });
    const [document] = await SkillFactory.createSearchDocuments(auth, [skill]);
    mockSearch.mockResolvedValue({
      hits: {
        hits: [
          {
            _source: {
              ...document,
              description: "Description",
              icon: null,
              requested_space_ids: [],
              editor_ids: [user.sId, user.sId, "missing-user"],
              last_edited_by_user_id: null,
              active_users_count: null,
              updated_at:
                updatedAt === null ? null : new Date(updatedAt).toISOString(),
            },
          },
        ],
        total: { value: 1, relation: "eq" },
      },
    });
    searchSkills.mockImplementation(originalSearch);

    const response = await searchRequest(workspace.sId, {
      query: "research",
    });

    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: undefined,
      offset: undefined,
      permissionFiltering: undefined,
      facets: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      filters: {
        status: undefined,
        mcpServerViewIds: undefined,
        availability: undefined,
        editedByMe: undefined,
        codeDefinedOnly: undefined,
        editorIds: undefined,
        childSkillIds: undefined,
        spaceIds: undefined,
        activeUsersCount: undefined,
      },
    });
    expect(await response.json()).toEqual({
      total: 1,
      hasMore: false,
      facets: {},
      skills: [
        {
          status: "active",
          canAdministrate: false,
          availability: "workspace_users",
          mcpServerViewIds: [],
          editorIds: [user.sId, user.sId, "missing-user"],
          editedBy: null,
          editors: [
            {
              sId: user.sId,
              fullName: user.toJSON().fullName,
              image: user.toJSON().image,
            },
          ],
          activeUsersCount: null,
          updatedAt,
          icon: null,
          name: "Search result",
          requestedSpaceIds: [],
          sId: skill.sId,
          userFacingDescription: "Description",
        },
      ],
    });
  });

  it("passes offset through and returns total", async () => {
    const { workspace } = await setup();
    searchSkills.mockResolvedValue(
      new Ok({ skills: [], total: 130, hasMore: true, facets: {} })
    );
    const response = await searchRequest(workspace.sId, {
      query: "research",
      limit: 100,
      offset: 25,
    });
    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: 100,
      offset: 25,
      permissionFiltering: undefined,
      facets: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      filters: {
        status: undefined,
        mcpServerViewIds: undefined,
        availability: undefined,
        editedByMe: undefined,
        codeDefinedOnly: undefined,
        editorIds: undefined,
        childSkillIds: undefined,
        spaceIds: undefined,
        activeUsersCount: undefined,
      },
    });
    const body = await response.json();
    expect(body).toEqual({
      skills: [],
      total: 130,
      hasMore: true,
      facets: {},
    });
  });

  it.each([
    { limit: 101 },
    { limit: 1.5 },
    { offset: -1 },
    { offset: 1.5 },
    { offset: "25" },
    { permissionFiltering: "dangerously_skip" },
    { editedByMe: false },
    { editedByMe: 1 },
    { codeDefinedOnly: false },
    { sortBy: "unknown" },
    { sortOrder: "unknown" },
    { availability: ["unknown"] },
    { status: ["suggested"] },
    { status: ["active", "suggested"] },
    { status: [] },
    { mcpServerViewIds: [""] },
    { editorIds: [""] },
    { childSkillIds: [""] },
    { spaceIds: [""] },
    { activeUsersCount: { max: -1 } },
    { facets: ["tags"] },
  ])("rejects invalid pagination: %s", async (query) => {
    const { workspace } = await setup();
    const response = await searchRequest(workspace.sId, query);
    expect(response.status).toBe(400);
    expect(searchSkills).not.toHaveBeenCalled();
  });

  it("returns facet values with counts and names", async () => {
    const { workspace, user, globalSpace } = await setup();
    searchSkills.mockResolvedValue(
      new Ok({
        skills: [],
        total: 0,
        hasMore: false,
        facets: {
          availability: [
            { value: "workspace_users", count: 2 },
            { value: "unknown", count: 1 },
          ],
          editors: [
            { value: user.sId, count: 3 },
            { value: "missing-user", count: 1 },
          ],
          childSkills: [{ value: "missing-skill", count: 1 }],
          spaces: [{ value: globalSpace.sId, count: 4 }],
          usage: { min: 1, max: 9 },
        },
      })
    );

    const response = await searchRequest(workspace.sId, {
      limit: 0,
      facets: ["availability", "editors", "childSkills", "spaces", "usage"],
    });

    expect(response.status).toBe(200);
    expect((await response.json()).facets).toEqual({
      availability: [{ availability: "workspace_users", count: 2 }],
      editors: [
        {
          sId: user.sId,
          fullName: user.toJSON().fullName,
          image: user.toJSON().image,
          count: 3,
        },
      ],
      childSkills: [],
      spaces: [
        {
          sId: globalSpace.sId,
          name: globalSpace.name,
          kind: "global",
          count: 4,
        },
      ],
      usage: { min: 1, max: 9 },
    });
  });

  it("names the tool views the caller can read and drops the others", async () => {
    const { workspace, globalSpace } = await setup();
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const server = await RemoteMCPServerFactory.create(workspace, {
      name: "Readable tool",
    });
    const hiddenServer = await RemoteMCPServerFactory.create(workspace);
    for (const { sId } of [server, hiddenServer]) {
      await MCPServerViewResource.getMCPServerViewForSystemSpace(
        adminAuth,
        sId
      );
    }
    const view = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const hiddenView = await MCPServerViewFactory.create(
      workspace,
      hiddenServer.sId,
      await SpaceFactory.regular(workspace)
    );
    searchSkills.mockResolvedValue(
      new Ok({
        skills: [],
        total: 0,
        hasMore: false,
        facets: {
          mcpServerViews: [
            { value: view.sId, count: 2 },
            { value: hiddenView.sId, count: 1 },
            { value: "missing-view", count: 1 },
          ],
        },
      })
    );

    const response = await searchRequest(workspace.sId, {
      limit: 0,
      facets: ["mcpServerViews"],
    });

    expect(response.status).toBe(200);
    expect((await response.json()).facets).toEqual({
      mcpServerViews: [
        {
          sId: view.sId,
          mcpServerId: server.sId,
          name: view.getDisplayName(),
          icon: view.getServerDisplayMetadata().icon,
          count: 2,
        },
      ],
    });
  });

  it("returns a bad request when the offset is out of range", async () => {
    const { workspace } = await setup();
    searchSkills.mockResolvedValue(new Err("offset_out_of_range"));

    const response = await searchRequest(workspace.sId, { offset: 9990 });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { type: "invalid_request_error" },
    });
  });

  it("returns an internal error when Elasticsearch fails", async () => {
    const { workspace } = await setup();
    searchSkills.mockResolvedValue(
      new Err(new ElasticsearchError("query_error", "Search failed"))
    );
    const response = await searchRequest(workspace.sId, {});
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.type).toBe("internal_server_error");
  });

  it("allows admins to opt into redacted search", async () => {
    const { workspace } = await setup("admin");
    searchSkills.mockResolvedValue(
      new Ok({ skills: [], total: 0, hasMore: false, facets: {} })
    );
    const response = await searchRequest(workspace.sId, {
      permissionFiltering: "redact_unreadable",
    });
    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "",
      limit: undefined,
      offset: undefined,
      permissionFiltering: "redact_unreadable",
      facets: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      filters: {
        status: undefined,
        mcpServerViewIds: undefined,
        availability: undefined,
        editedByMe: undefined,
        codeDefinedOnly: undefined,
        editorIds: undefined,
        childSkillIds: undefined,
        spaceIds: undefined,
        activeUsersCount: undefined,
      },
    });
  });

  it("accepts structured filters and opt-in editor selection", async () => {
    const { workspace } = await setup();
    searchSkills.mockResolvedValue(
      new Ok({ skills: [], total: 0, hasMore: false, facets: {} })
    );
    const response = await searchRequest(workspace.sId, {
      status: ["active", "archived"],
      mcpServerViewIds: ["tool"],
      availability: ["editors", "workspace_users"],
      editedByMe: true,
      codeDefinedOnly: true,
      sortBy: "usage",
    });
    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sortBy: "usage",
        filters: {
          status: ["active", "archived"],
          mcpServerViewIds: ["tool"],
          availability: ["editors", "workspace_users"],
          editedByMe: true,
          codeDefinedOnly: true,
        },
      })
    );
  });

  it.each([
    "user",
    "manager",
  ] as const)("rejects redacted search for a %s before searching", async (role) => {
    const { workspace } = await setup(role);
    const response = await searchRequest(workspace.sId, {
      permissionFiltering: "redact_unreadable",
    });
    expect(response.status).toBe(403);
    expect(searchSkills).not.toHaveBeenCalled();
  });
});
