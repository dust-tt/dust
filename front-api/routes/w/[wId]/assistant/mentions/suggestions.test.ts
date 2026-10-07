import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSearch = vi.hoisted(() => vi.fn());

vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  return {
    ...actual,
    withEs: async (
      fn: (client: { search: typeof mockSearch }) => Promise<unknown>
    ) => new Ok(await fn({ search: mockSearch })),
  };
});

describe("GET /api/w/:wId/assistant/mentions/suggestions", () => {
  beforeEach(() => {
    mockSearch.mockReset();
    mockSearch.mockResolvedValue({ hits: { hits: [], total: { value: 0 } } });
  });

  it.each([
    { query: "", hasFavorites: true },
    { query: "   ", hasFavorites: true },
    { query: "", hasFavorites: false },
    { query: "other", hasFavorites: true },
  ])(
    "lists favorites without searching only for a blank query with favorites: %j",
    async ({ query, hasFavorites }) => {
      const { auth, workspace } = await createPrivateApiMockRequest({
        role: "user",
      });

      const zuluConfiguration = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Zulu Favorite" }
      );
      const alphaConfiguration =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Alpha Favorite",
        });
      const zulu = await AgentResource.fetchById(auth, zuluConfiguration.sId);
      const alpha = await AgentResource.fetchById(auth, alphaConfiguration.sId);
      assert(zulu && alpha);
      if (hasFavorites) {
        const zuluResult = await zulu.setUserFavorite(auth, true);
        const alphaResult = await alpha.setUserFavorite(auth, true);
        expect(zuluResult.isOk() && alphaResult.isOk()).toBe(true);
      }

      const params = new URLSearchParams({ query, select: "agents" });
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/assistant/mentions/suggestions?${params}`
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      if (!query.trim() && hasFavorites) {
        expect(
          body.suggestions.map((suggestion: { id: string }) => suggestion.id)
        ).toEqual([alpha.sId, zulu.sId]);
        expect(mockSearch).not.toHaveBeenCalled();
      } else {
        expect(body.suggestions).toEqual([]);
        expect(mockSearch).toHaveBeenCalledOnce();
      }
    }
  );

  it.each([{ callerIsProjectMember: true }, { callerIsProjectMember: false }])(
    "only flags project members when the caller can read the space: %j",
    async ({ callerIsProjectMember }) => {
      const { workspace, user } = await createPrivateApiMockRequest({
        role: "user",
      });
      const insider = await UserFactory.basic();
      await MembershipFactory.associate(workspace, insider, { role: "user" });

      // The project creator is its only member.
      const project = await SpaceFactory.project(
        workspace,
        callerIsProjectMember ? user.id : insider.id
      );

      mockSearch.mockResolvedValue({
        hits: {
          hits: [user, insider].map((u) => ({ _source: { user_id: u.sId } })),
          total: { value: 2 },
        },
      });

      const params = new URLSearchParams({
        select: "users",
        current: "true",
        spaceId: project.sId,
      });
      const response = await honoApp.request(
        `/api/w/${workspace.sId}/assistant/mentions/suggestions?${params}`
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      const flags = Object.fromEntries(
        body.suggestions.map(
          (suggestion: { id: string; isProjectMember?: boolean }) => [
            suggestion.id,
            suggestion.isProjectMember,
          ]
        )
      );
      expect(flags).toEqual(
        callerIsProjectMember
          ? { [user.sId]: true, [insider.sId]: false }
          : { [user.sId]: false, [insider.sId]: false }
      );
    }
  );
});
