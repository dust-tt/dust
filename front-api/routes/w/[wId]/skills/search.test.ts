import { SkillSearchCursorError } from "@app/lib/skill_search/cursor";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

const searchSkillsForCommandMenu = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/skills/search", () => ({
  searchSkillsForCommandMenu,
}));

describe("GET /api/w/:wId/skills/search", () => {
  beforeEach(() => {
    searchSkillsForCommandMenu.mockReset();
  });

  it("routes the query to the skill command-menu search", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    searchSkillsForCommandMenu.mockResolvedValue(
      new Ok({
        skills: [
          {
            editedBy: null,
            icon: null,
            name: "Search result",
            requestedSpaceIds: [],
            sId: "search-result",
            userFacingDescription: "Description",
          },
        ],
        nextCursor: null,
      })
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/skills/search?query=research`
    );

    expect(response.status).toBe(200);
    expect(searchSkillsForCommandMenu).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: undefined,
      cursor: undefined,
      permissionFiltering: undefined,
    });
    expect(await response.json()).toEqual({
      nextCursor: null,
      skills: [
        {
          editedBy: null,
          icon: null,
          name: "Search result",
          requestedSpaceIds: [],
          sId: "search-result",
          userFacingDescription: "Description",
        },
      ],
    });
  });

  it("accepts an optional page size and cursor", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    const cursor = "00000000-0000-4000-8000-000000000000";
    searchSkillsForCommandMenu.mockResolvedValue(
      new Ok({ skills: [], nextCursor: cursor })
    );
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/skills/search?query=research&limit=10&cursor=${cursor}`
    );
    expect(response.status).toBe(200);
    expect(searchSkillsForCommandMenu).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
      limit: 10,
      cursor,
      permissionFiltering: undefined,
    });
    const body = await response.json();
    expect(body).toEqual({ skills: [], nextCursor: cursor });
  });

  it.each([
    "limit=0",
    "limit=151",
    "limit=1.5",
    "cursor=invalid",
    "permissionFiltering=dangerously_skip",
  ])("rejects invalid pagination: %s", async (query) => {
    const { workspace } = await createPrivateApiMockRequest();
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/skills/search?${query}`
    );
    expect(response.status).toBe(400);
    expect(searchSkillsForCommandMenu).not.toHaveBeenCalled();
  });

  it("tells the caller to restart an expired or mismatched cursor", async () => {
    const { workspace } = await createPrivateApiMockRequest();
    searchSkillsForCommandMenu.mockResolvedValue(
      new Err(new SkillSearchCursorError())
    );
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/skills/search?cursor=00000000-0000-4000-8000-000000000000`
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("Restart the search");
  });

  it("allows admins to opt into redacted search", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });
    searchSkillsForCommandMenu.mockResolvedValue(
      new Ok({ skills: [], nextCursor: null })
    );
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/skills/search?permissionFiltering=redact_unreadable`
    );
    expect(response.status).toBe(200);
    expect(searchSkillsForCommandMenu).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "",
      limit: undefined,
      cursor: undefined,
      permissionFiltering: "redact_unreadable",
    });
  });

  it.each([
    "user",
    "builder",
    "manager",
  ] as const)("rejects redacted search for a %s before searching", async (role) => {
    const { workspace } = await createPrivateApiMockRequest({ role });
    const response = await honoApp.request(
      `/api/w/${workspace.sId}/skills/search?permissionFiltering=redact_unreadable`
    );
    expect(response.status).toBe(403);
    expect(searchSkillsForCommandMenu).not.toHaveBeenCalled();
  });
});
