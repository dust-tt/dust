import {
  listDiscoveryForYouItems,
  listDiscoveryTrendingItems,
} from "@app/lib/api/discovery";
import { fetchDiscoveryForYouCandidates } from "@app/lib/search_usage/for_you";
import { fetchDiscoveryTrendingCandidates } from "@app/lib/search_usage/trending";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/search_usage/trending"), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchDiscoveryTrendingCandidates: vi.fn(),
}));

vi.mock(import("@app/lib/search_usage/for_you"), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchDiscoveryForYouCandidates: vi.fn(),
}));

const mockedFetchTrending = vi.mocked(fetchDiscoveryTrendingCandidates);
const mockedFetchForYou = vi.mocked(fetchDiscoveryForYouCandidates);

function forYouCandidate(resourceType: "agent" | "skill", resourceId: string) {
  return {
    resourceType,
    resourceId,
    score: 1,
    reasonGroupId: "group-1",
    users: 3,
    groupActiveUsers: 5,
    viewerConversations: 0,
  };
}

describe("discovery ranked sections", () => {
  beforeEach(() => {
    mockedFetchTrending.mockReset();
    mockedFetchForYou.mockReset();
  });

  it("omits unresolved candidates and interleaves the ranked pools", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const visibleAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Visible trending agent",
    });
    const visibleSkill = await SkillFactory.create(auth, {
      name: "Visible trending skill",
    });

    mockedFetchTrending.mockResolvedValue(
      new Ok({
        agents: [
          {
            resourceType: "agent",
            resourceId: visibleAgent.sId,
            currentUsers: 8,
            previousUsers: 3,
            userGrowth: 5,
          },
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
    expect(result.value).toEqual([
      {
        type: "agent",
        target: {
          sId: visibleAgent.sId,
          name: visibleAgent.name,
          description: visibleAgent.description,
          pictureUrl: visibleAgent.pictureUrl,
        },
      },
      { type: "skill", target: visibleSkill.toDiscoveryJSON() },
    ]);
  });

  it("keeps the for-you score order across kinds and omits unresolved candidates", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const visibleAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Visible for-you agent",
    });
    const visibleSkill = await SkillFactory.create(auth, {
      name: "Visible for-you skill",
    });

    mockedFetchForYou.mockResolvedValue(
      new Ok([
        forYouCandidate("skill", visibleSkill.sId),
        forYouCandidate("agent", "missing-agent"),
        forYouCandidate("agent", visibleAgent.sId),
        forYouCandidate("skill", "missing-skill"),
      ])
    );

    const result = await listDiscoveryForYouItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([
      { type: "skill", target: visibleSkill.toDiscoveryJSON() },
      {
        type: "agent",
        target: {
          sId: visibleAgent.sId,
          name: visibleAgent.name,
          description: visibleAgent.description,
          pictureUrl: visibleAgent.pictureUrl,
        },
      },
    ]);
  });

  it("omits unpublished agents even when the viewer can read them", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Unpublished agent",
      scope: "hidden",
    });

    mockedFetchForYou.mockResolvedValue(
      new Ok([forYouCandidate("agent", hiddenAgent.sId)])
    );

    const result = await listDiscoveryForYouItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([]);
  });

  it("preserves a pending trending cache fill", async () => {
    const { auth } = await createPrivateApiMockRequest();
    mockedFetchTrending.mockResolvedValue(new Ok(null));

    const result = await listDiscoveryTrendingItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBeNull();
  });

  it("preserves a pending For You cache fill", async () => {
    const { auth } = await createPrivateApiMockRequest();
    mockedFetchForYou.mockResolvedValue(new Ok(null));

    const result = await listDiscoveryForYouItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toBeNull();
  });
});
