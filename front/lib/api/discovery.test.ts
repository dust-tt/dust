import {
  listDiscoveryForYouItems,
  listDiscoveryTrendingItems,
} from "@app/lib/api/discovery";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { GLOBAL_SKILLS_ARRAY } from "@app/lib/resources/skill/code_defined/global";
import { fetchDiscoveryForYouCandidates } from "@app/lib/search_usage/for_you";
import { fetchDiscoveryTrendingCandidates } from "@app/lib/search_usage/trending";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import {
  GLOBAL_AGENTS_SID,
  getGlobalAgentAuthorName,
} from "@app/types/assistant/assistant";
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
      addCurrentUserAsEditor: true,
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
          scope: visibleAgent.scope,
          lastAuthors: ["Me"],
          userFavorite: false,
        },
      },
      {
        type: "skill",
        target: {
          sId: visibleSkill.sId,
          name: visibleSkill.name,
          description: visibleSkill.userFacingDescription,
          icon: visibleSkill.icon,
          editedBy: visibleSkill.editedBy,
          editors: [auth.getNonNullableUser().fullName()],
        },
      },
    ]);
  });

  it("keeps the for-you score order across kinds and omits unresolved candidates", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const visibleAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Visible for-you agent",
    });
    const resource = await AgentResource.fetchById(auth, visibleAgent.sId);
    if (!resource) {
      throw new Error("Agent not found");
    }
    await resource.setUserFavorite(auth, true);
    const visibleSkill = await SkillFactory.create(auth, {
      name: "Visible for-you skill",
      addCurrentUserAsEditor: true,
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
      {
        type: "skill",
        target: {
          sId: visibleSkill.sId,
          name: visibleSkill.name,
          description: visibleSkill.userFacingDescription,
          icon: visibleSkill.icon,
          editedBy: visibleSkill.editedBy,
          editors: [auth.getNonNullableUser().fullName()],
        },
      },
      {
        type: "agent",
        target: {
          sId: visibleAgent.sId,
          name: visibleAgent.name,
          description: visibleAgent.description,
          pictureUrl: visibleAgent.pictureUrl,
          scope: visibleAgent.scope,
          lastAuthors: ["Me"],
          userFavorite: true,
        },
      },
    ]);
  });

  it("returns global agent attribution and scope", async () => {
    const { auth } = await createPrivateApiMockRequest();
    mockedFetchForYou.mockResolvedValue(
      new Ok([forYouCandidate("agent", GLOBAL_AGENTS_SID.HELPER)])
    );

    const result = await listDiscoveryForYouItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([
      {
        type: "agent",
        target: expect.objectContaining({
          sId: GLOBAL_AGENTS_SID.HELPER,
          scope: "global",
          lastAuthors: [getGlobalAgentAuthorName(GLOBAL_AGENTS_SID.HELPER)],
          userFavorite: false,
        }),
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

  it("omits editors-only skills for viewers outside their editor group", async () => {
    const { auth } = await createPrivateApiMockRequest({ role: "admin" });
    const unpublished = await SkillFactory.create(auth, {
      availability: "editors",
      addCurrentUserAsEditor: false,
    });
    expect(auth.can("read", unpublished)).toBe(true);
    expect(auth.can("write", unpublished)).toBe(false);
    mockedFetchForYou.mockResolvedValue(
      new Ok([forYouCandidate("skill", unpublished.sId)])
    );

    const result = await listDiscoveryForYouItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([]);
  });

  it("returns code-defined skill targets without an editing user or editors", async () => {
    const { auth } = await createPrivateApiMockRequest();
    const definition = GLOBAL_SKILLS_ARRAY[0];
    mockedFetchForYou.mockResolvedValue(
      new Ok([forYouCandidate("skill", definition.sId)])
    );

    const result = await listDiscoveryForYouItems(auth);

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([
      {
        type: "skill",
        target: {
          sId: definition.sId,
          name: definition.name,
          description: definition.userFacingDescription,
          icon: definition.icon,
          editors: [],
          editedBy: null,
        },
      },
    ]);
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
