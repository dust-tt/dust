import { listDiscoveryTrendingItems } from "@app/lib/api/discovery";
import { fetchDiscoveryTrendingCandidates } from "@app/lib/search_usage/trending";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/search_usage/trending"), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchDiscoveryTrendingCandidates: vi.fn(),
}));

const mockedFetchTrending = vi.mocked(fetchDiscoveryTrendingCandidates);

describe("listDiscoveryTrendingItems", () => {
  beforeEach(() => {
    mockedFetchTrending.mockReset();
  });

  it("omits unresolved candidates before combining and limiting them", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const visibleSkill = await SkillFactory.create(auth, {
      name: "Visible trending skill",
    });

    mockedFetchTrending.mockResolvedValue(
      new Ok({
        agents: [
          {
            resourceType: "agent",
            resourceId: "missing-agent",
            currentUsers: 20,
            previousUsers: 1,
            userGrowth: 19,
          },
        ],
        skills: [
          {
            resourceType: "skill",
            resourceId: "missing-skill",
            currentUsers: 20,
            previousUsers: 2,
            userGrowth: 18,
          },
          {
            resourceType: "skill",
            resourceId: visibleSkill.sId,
            currentUsers: 8,
            previousUsers: 4,
            userGrowth: 4,
          },
        ],
      })
    );

    const result = await listDiscoveryTrendingItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([{ kind: "skill", itemId: visibleSkill.sId }]);
  });

  it("preserves a pending cache fill", async () => {
    const { auth } = await createPrivateApiMockRequest();
    mockedFetchTrending.mockResolvedValue(new Ok(null));

    const result = await listDiscoveryTrendingItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBeNull();
  });
});
