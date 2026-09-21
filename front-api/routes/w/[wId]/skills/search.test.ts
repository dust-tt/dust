import { ElasticsearchError } from "@app/lib/api/elasticsearch";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
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
    const { workspace, user } = await setup();
    searchSkills.mockResolvedValue(
      new Ok({
        skills: [
          {
            status: "active",
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
        hasMore: false,
        nextCursor: null,
      })
    );

    const response = await searchRequest(workspace.sId, { query: "research" });

    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: undefined,
      cursor: undefined,
      permissionFiltering: undefined,
      sortBy: undefined,
      filters: {
        status: undefined,
        mcpServerViewIds: undefined,
        availability: undefined,
        editedByMe: undefined,
        codeDefinedOnly: undefined,
      },
    });
    expect(await response.json()).toEqual({
      hasMore: false,
      nextCursor: null,
      editors: [
        {
          sId: user.sId,
          fullName: user.toJSON().fullName,
          image: user.toJSON().image,
        },
      ],
      skills: [
        {
          status: "active",
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
    });
  });

  it("passes opaque cursor strings through without interpreting them", async () => {
    const { workspace } = await setup();
    const cursor = "opaque-cursor";
    searchSkills.mockResolvedValue(
      new Ok({ skills: [], hasMore: true, nextCursor: cursor })
    );
    const response = await searchRequest(workspace.sId, {
      query: "research",
      limit: 100,
      cursor,
    });
    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: 100,
      cursor,
      permissionFiltering: undefined,
      sortBy: undefined,
      filters: {
        status: undefined,
        mcpServerViewIds: undefined,
        availability: undefined,
        editedByMe: undefined,
        codeDefinedOnly: undefined,
      },
    });
    const body = await response.json();
    expect(body).toEqual({
      skills: [],
      editors: [],
      hasMore: true,
      nextCursor: cursor,
    });
  });

  it.each([
    { limit: 0 },
    { limit: 101 },
    { limit: 1.5 },
    { cursor: [{}] },
    { cursor: [["nested"]] },
    { permissionFiltering: "dangerously_skip" },
    { editedByMe: false },
    { editedByMe: 1 },
    { codeDefinedOnly: false },
    { sortBy: "name" },
    { availability: ["unknown"] },
    { status: ["suggested"] },
    { status: ["active", "suggested"] },
    { status: [] },
    { mcpServerViewIds: [""] },
  ])("rejects invalid pagination: %s", async (query) => {
    const { workspace } = await setup();
    const response = await searchRequest(workspace.sId, query);
    expect(response.status).toBe(400);
    expect(searchSkills).not.toHaveBeenCalled();
  });

  it("returns a bad request when search rejects the cursor", async () => {
    const { workspace } = await setup();
    searchSkills.mockResolvedValue(new Err("invalid_cursor"));

    const response = await searchRequest(workspace.sId, { cursor: "invalid" });

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
      new Ok({ skills: [], hasMore: false, nextCursor: null })
    );
    const response = await searchRequest(workspace.sId, {
      permissionFiltering: "redact_unreadable",
    });
    expect(response.status).toBe(200);
    expect(searchSkills).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "",
      limit: undefined,
      cursor: undefined,
      permissionFiltering: "redact_unreadable",
      sortBy: undefined,
      filters: {
        status: undefined,
        mcpServerViewIds: undefined,
        availability: undefined,
        editedByMe: undefined,
        codeDefinedOnly: undefined,
      },
    });
  });

  it("accepts structured filters and opt-in editor selection", async () => {
    const { workspace } = await setup();
    searchSkills.mockResolvedValue(
      new Ok({ skills: [], hasMore: false, nextCursor: null })
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
