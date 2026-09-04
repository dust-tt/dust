import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
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
      new Ok([
        {
          editedBy: null,
          icon: null,
          name: "Search result",
          requestedSpaceIds: [],
          sId: "search-result",
          userFacingDescription: "Description",
        },
      ])
    );

    const response = await honoApp.request(
      `/api/w/${workspace.sId}/skills/search?query=research`
    );

    expect(response.status).toBe(200);
    expect(searchSkillsForCommandMenu).toHaveBeenCalledWith(expect.anything(), {
      searchTerm: "research",
    });
    expect(await response.json()).toEqual({
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
});
