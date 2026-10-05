import { SKILLS_PER_LLM_CALL } from "@app/lib/api/skills/existing_skill_checker";
import { Authenticator } from "@app/lib/auth";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import type { MembershipRoleType } from "@app/types/memberships";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration";
import { honoApp } from "@front-api/app";

async function setup(role: MembershipRoleType = "user") {
  const { workspace, user } = await createPrivateApiMockRequest({ role });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  return { workspace, auth };
}

async function createSkills(
  auth: Authenticator,
  count: number,
  options?: {
    availability?: SkillAvailability;
  }
) {
  const skills = [];
  for (let i = 0; i < count; i++) {
    skills.push(
      await SkillFactory.create(auth, {
        name: `Test Skill ${i}`,
        agentFacingDescription: `Test skill description ${i}`,
        ...options,
      })
    );
  }
  return skills;
}

function post(workspace: { sId: string }, body: unknown) {
  return honoApp.request(`/api/w/${workspace.sId}/skills/similar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSimilarSkillsResponse(similarSkillIds: string[]) {
  return new Ok({
    actions: [
      {
        name: "set_similar_skills",
        arguments: { similar_skills_array: similarSkillIds },
      },
    ],
    generation: "",
  });
}

describe("POST /api/w/:wId/skills/similar", () => {
  beforeEach(() => {
    vi.mocked(runMultiActionsAgent).mockClear();
  });

  it("returns similar skills when runMultiActionsAgent succeeds", async () => {
    const { workspace, auth } = await setup();
    const [first, second] = await createSkills(auth, 3, {
      availability: "users_and_agents",
    });

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      mockSimilarSkillsResponse([first.sId, second.sId])
    );

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      similar_skills: [first.sId, second.sId],
    });
    expect(runMultiActionsAgent).toHaveBeenCalledTimes(1);
  });

  it("returns empty similar skills when runMultiActionsAgent succeeds with empty array", async () => {
    const { workspace, auth } = await setup();
    await createSkills(auth, 1);

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      mockSimilarSkillsResponse([])
    );

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_skills: [] });
  });

  it("returns empty similar skills without calling the LLM when the workspace has no custom skills", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_skills: [] });
    expect(runMultiActionsAgent).not.toHaveBeenCalled();
  });

  it("ignores unpublished (editors-only) skills", async () => {
    const { workspace, auth } = await setup();

    await SkillFactory.create(auth, {
      name: "Unpublished Skill",
      availability: "editors",
    });

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_skills: [] });
    // Never calls runMultiActionsAgent because there is no published skill to check
    expect(runMultiActionsAgent).not.toHaveBeenCalled();
  });

  it("drops the skill ids the LLM made up", async () => {
    const { workspace, auth } = await setup();
    const [skill] = await createSkills(auth, 1, {
      availability: "users_and_agents",
    });

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      mockSimilarSkillsResponse([skill.sId, "skl_madeUp"])
    );

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_skills: [skill.sId] });
  });

  it("batches skills into multiple LLM calls and merges the results", async () => {
    const { workspace, auth } = await setup();
    const skills = await createSkills(auth, SKILLS_PER_LLM_CALL + 1, {
      availability: "users_and_agents",
    });
    const similarSkillIds = [skills[0].sId, skills[SKILLS_PER_LLM_CALL].sId];

    // Which batch a skill lands in is not known upfront: each call answers with the similar
    // skills of its own batch.
    vi.mocked(runMultiActionsAgent).mockImplementation(
      async (_auth, _config, { conversation }) => {
        const inputText = JSON.stringify(conversation.messages);
        return mockSimilarSkillsResponse(
          similarSkillIds.filter((sId) => inputText.includes(sId))
        );
      }
    );

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect([...body.similar_skills].sort()).toEqual(
      [...similarSkillIds].sort()
    );
    expect(runMultiActionsAgent).toHaveBeenCalledTimes(2);
  });

  it("returns 400 when naturalDescription is missing", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {});

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("naturalDescription");
  });

  it("returns 400 when availabilities contains an unknown value", async () => {
    const { workspace } = await setup();

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
      availabilities: ["not_an_availability"],
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe("invalid_request_error");
    expect(body.error.message).toContain("availabilities");
  });

  it("only compares against skills matching the requested availabilities", async () => {
    const { workspace, auth } = await setup();

    const discoverableSkill = await SkillFactory.create(auth, {
      name: "Discoverable Skill",
      agentFacingDescription: "Open support cards on github.com",
      availability: "users_and_agents",
    });
    await SkillFactory.create(auth, {
      name: "Members Only Skill",
      agentFacingDescription: "Create issues on GitHub repositories",
      availability: "workspace_users",
    });

    vi.mocked(runMultiActionsAgent).mockResolvedValue(
      mockSimilarSkillsResponse([discoverableSkill.sId])
    );

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
      availabilities: ["users_and_agents"],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      similar_skills: [discoverableSkill.sId],
    });
    expect(runMultiActionsAgent).toHaveBeenCalledTimes(1);

    // Only the users_and_agents skill was submitted to the LLM.
    const [, , { conversation }] =
      vi.mocked(runMultiActionsAgent).mock.calls[0];
    const inputText = JSON.stringify(conversation.messages);
    expect(inputText).toContain(discoverableSkill.sId);
    expect(inputText).not.toContain("Create issues on GitHub repositories");
  });

  it("returns empty similar skills without calling the LLM when no skill matches the requested availabilities", async () => {
    const { workspace, auth } = await setup();

    await SkillFactory.create(auth, {
      name: "Members Only Skill",
      availability: "workspace_users",
    });

    const response = await post(workspace, {
      naturalDescription: "Create GitHub issues for support",
      availabilities: ["users_and_agents"],
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ similar_skills: [] });
    expect(runMultiActionsAgent).not.toHaveBeenCalled();
  });
});
