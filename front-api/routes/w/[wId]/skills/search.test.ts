import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { MembershipRoleType } from "@app/types/memberships";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchSkills = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/skills/search", () => ({
  searchSkills,
}));

async function setup(role: MembershipRoleType = "user") {
  const context = await createPrivateApiMockRequest({ role });

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
  });

  it.each(["user", "admin"] as const)(
    "only names visible skills in facets for a %s",
    async (role) => {
      const { workspace, auth } = await setup(role);
      const published = await SkillFactory.create(auth, {
        name: "Published",
        availability: "workspace_users",
        addCurrentUserAsEditor: false,
      });
      const edited = await SkillFactory.create(auth, { name: "Edited" });
      const unpublished = await SkillFactory.create(auth, {
        name: "Unpublished",
        addCurrentUserAsEditor: false,
      });
      searchSkills.mockResolvedValue(
        new Ok({
          skills: [],
          total: 0,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {
            childSkills: [
              { value: unpublished.sId, count: 3 },
              { value: published.sId, count: 2 },
              { value: edited.sId, count: 1 },
              { value: "missing-skill", count: 4 },
            ],
          },
        })
      );

      const response = await searchRequest(workspace.sId, {
        facets: ["childSkills"],
      });

      expect(response.status).toBe(200);
      expect((await response.json()).facets.childSkills).toEqual([
        edited.toSearchFacetJSON(1),
        published.toSearchFacetJSON(2),
      ]);
    }
  );

  it.each(["favorites_only", "favorites_or_all", "all"] as const)(
    "forwards selection mode %s and reports the selected result",
    async (selectionMode) => {
      const { workspace } = await setup();
      searchSkills.mockResolvedValue(
        new Ok({
          skills: [],
          total: 0,
          hasMore: false,
          isFavoritesOnly: selectionMode === "favorites_only",
          facets: {},
        })
      );

      const response = await searchRequest(workspace.sId, {
        selectionMode,
        excludeSkillId: "current-skill",
      });

      expect(response.status).toBe(200);
      expect(searchSkills).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          selectionMode,
          excludeSkillId: "current-skill",
        })
      );
      expect((await response.json()).isFavoritesOnly).toBe(
        selectionMode === "favorites_only"
      );
    }
  );

  it.each([
    { query: "", expected: "favorites_or_all" },
    { query: "   ", expected: "favorites_or_all" },
    { query: "research", expected: "favorites_or_all" },
    { query: "", selectionMode: "all", expected: "all" },
  ])(
    "accepts the legacy blank-query favorite option: %j",
    async ({ query, selectionMode, expected }) => {
      const { workspace } = await setup();
      searchSkills.mockResolvedValue(
        new Ok({
          skills: [],
          total: 0,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {},
        })
      );

      const response = await searchRequest(workspace.sId, {
        query,
        defaultToFavorites: true,
        selectionMode,
      });

      expect(response.status).toBe(200);
      expect(searchSkills).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ selectionMode: expected })
      );
    }
  );

  it("rejects unknown selection modes", async () => {
    const { workspace } = await setup();
    const response = await searchRequest(workspace.sId, {
      selectionMode: "invalid",
    });
    expect(response.status).toBe(400);
    expect(searchSkills).not.toHaveBeenCalled();
  });

  it.each(["user", "admin"] as const)(
    "allows search for a %s without feature flags",
    async (role) => {
      const { workspace } = await createPrivateApiMockRequest({ role });

      searchSkills.mockResolvedValue(
        new Ok({
          skills: [],
          total: 0,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {},
        })
      );
      const response = await searchRequest(workspace.sId);

      expect(response.status).toBe(200);
      expect(searchSkills).toHaveBeenCalledOnce();
    }
  );

  it.each([0, null])(
    "routes search results with updatedAt=%s",
    async (updatedAt) => {
      const { workspace, user } = await setup();
      searchSkills.mockResolvedValue(
        new Ok({
          skills: [
            {
              status: "active",
              canWrite: false,
              canAdministrate: false,
              availability: "workspace_users",
              mcpServerViewIds: [],
              editorIds: [user.sId, user.sId, "missing-user"],
              activeUsersCount: null,
              updatedAt,
              icon: null,
              name: "Search result",
              requestedSpaceIds: [],
              sId: "search-result",
              userFacingDescription: "Description",
            },
          ],
          total: 1,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {},
        })
      );

      const response = await searchRequest(workspace.sId, {
        query: "research",
      });

      expect(response.status).toBe(200);
      expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
        searchTerm: "research",
        searchType: "autocomplete",
        limit: undefined,
        offset: undefined,
        permissionFiltering: undefined,
        facets: undefined,
        sortBy: undefined,
        sortOrder: undefined,
        selectionMode: "all",
        excludeSkillId: undefined,
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
        isFavoritesOnly: false,
        facets: {},
        skills: [
          {
            status: "active",
            canWrite: false,
            canAdministrate: false,
            availability: "workspace_users",
            mcpServerViewIds: [],
            editorIds: [user.sId, user.sId, "missing-user"],
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
            sId: "search-result",
            userFacingDescription: "Description",
            isFavorite: false,
          },
        ],
      });
    }
  );

  it("flags the current user's favorite skills", async () => {
    const { workspace, auth } = await setup();
    const favorite = await SkillFactory.create(auth, { name: "Favorite" });
    const other = await SkillFactory.create(auth, { name: "Other" });
    expect((await favorite.setFavorite(auth, true)).isOk()).toBe(true);
    const listItem = {
      status: "active",
      canWrite: false,
      canAdministrate: false,
      availability: "workspace_users",
      mcpServerViewIds: [],
      editorIds: [],
      activeUsersCount: null,
      updatedAt: null,
      icon: null,
      name: "Search result",
      requestedSpaceIds: [],
      userFacingDescription: "Description",
    };
    searchSkills.mockResolvedValue(
      new Ok({
        skills: [
          { ...listItem, sId: favorite.sId },
          { ...listItem, sId: other.sId },
        ],
        total: 2,
        hasMore: false,
        isFavoritesOnly: false,
        facets: {},
      })
    );

    const response = await searchRequest(workspace.sId);

    expect(response.status).toBe(200);
    expect((await response.json()).skills).toMatchObject([
      { sId: favorite.sId, isFavorite: true },
      { sId: other.sId, isFavorite: false },
    ]);
  });

  it("passes offset through and returns total", async () => {
    const { workspace } = await setup();
    searchSkills.mockResolvedValue(
      new Ok({
        skills: [],
        total: 130,
        hasMore: true,
        isFavoritesOnly: false,
        facets: {},
      })
    );
    const response = await searchRequest(workspace.sId, {
      query: "research",
      limit: 100,
      offset: 25,
    });
    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      searchType: "autocomplete",
      limit: 100,
      offset: 25,
      permissionFiltering: undefined,
      facets: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      selectionMode: "all",
      excludeSkillId: undefined,
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
      isFavoritesOnly: false,
      facets: {},
    });
  });

  it.each(["autocomplete", "name"] as const)(
    "passes %s search through",
    async (searchType) => {
      const { workspace } = await setup();
      searchSkills.mockResolvedValue(
        new Ok({
          skills: [],
          total: 0,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {},
        })
      );
      const response = await searchRequest(workspace.sId, {
        query: "Write",
        searchType,
      });
      expect(response.status).toBe(200);
      expect(searchSkills).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ searchTerm: "Write", searchType })
      );
    }
  );

  it.each([
    { limit: 101 },
    { limit: 1.5 },
    { offset: -1 },
    { offset: 1.5 },
    { offset: "25" },
    { permissionFiltering: "dangerously_skip" },
    { editedByMe: false },
    { editedByMe: 1 },
    { codeDefinedOnly: "false" },
    { searchType: "unknown" },
    { searchType: null },
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
        isFavoritesOnly: false,
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
        isFavoritesOnly: false,
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
      new Ok({
        skills: [],
        total: 0,
        hasMore: false,
        isFavoritesOnly: false,
        facets: {},
      })
    );
    const response = await searchRequest(workspace.sId, {
      permissionFiltering: "redact_unreadable",
    });
    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "",
      searchType: "autocomplete",
      limit: undefined,
      offset: undefined,
      permissionFiltering: "redact_unreadable",
      facets: undefined,
      sortBy: undefined,
      sortOrder: undefined,
      selectionMode: "all",
      excludeSkillId: undefined,
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

  it.each([true, false])(
    "accepts structured filters with codeDefinedOnly=%s",
    async (codeDefinedOnly) => {
      const { workspace } = await setup();
      searchSkills.mockResolvedValue(
        new Ok({
          skills: [],
          total: 0,
          hasMore: false,
          isFavoritesOnly: false,
          facets: {},
        })
      );
      const response = await searchRequest(workspace.sId, {
        status: ["active", "archived"],
        mcpServerViewIds: ["tool"],
        availability: ["editors", "workspace_users"],
        editedByMe: true,
        codeDefinedOnly,
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
            codeDefinedOnly,
          },
        })
      );
    }
  );

  it.each(["user", "manager"] as const)(
    "rejects redacted search for a %s before searching",
    async (role) => {
      const { workspace } = await setup(role);
      const response = await searchRequest(workspace.sId, {
        permissionFiltering: "redact_unreadable",
      });
      expect(response.status).toBe(403);
      expect(searchSkills).not.toHaveBeenCalled();
    }
  );
});
