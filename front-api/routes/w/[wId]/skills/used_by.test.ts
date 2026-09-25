import { Authenticator } from "@app/lib/auth";
import { MAX_SKILL_SEARCH_RESULTS } from "@app/lib/skill_search/query";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { PostSkillsUsedByResponseBody } from "@app/types/api/skills";
import type { MembershipRoleType } from "@app/types/memberships";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

async function setup(role: MembershipRoleType = "user") {
  const context = await createPrivateApiMockRequest({ role });
  const otherUser = await UserFactory.basic();
  await MembershipFactory.associate(context.workspace, otherUser, {
    role: "user",
  });
  const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
    otherUser.sId,
    context.workspace.sId
  );
  return { ...context, otherAuth };
}

function usedByRequest(workspaceId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspaceId}/skills/used_by`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/skills/used_by", () => {
  it("rejects more skill IDs than a search page holds", async () => {
    const { workspace } = await setup();

    const response = await usedByRequest(workspace.sId, {
      skillIds: Array.from(
        { length: MAX_SKILL_SEARCH_RESULTS + 1 },
        (_, i) => `skl_${i}`
      ),
    });

    expect(response.status).toBe(400);
  });

  it.each([
    "user",
    "admin",
  ] as const)("lists only the agents and parent skills a %s can see", async (role) => {
    const { workspace, auth, otherAuth } = await setup(role);
    const skill = await SkillFactory.create(auth, {
      name: "Shared Skill",
      availability: "workspace_users",
    });
    const visibleAgent = await AgentConfigurationFactory.createTestAgent(
      otherAuth,
      { name: "Visible Agent", scope: "visible" }
    );
    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(
      otherAuth,
      { name: "Hidden Agent", scope: "hidden" }
    );
    for (const agent of [visibleAgent, hiddenAgent]) {
      await SkillFactory.linkToAgent(otherAuth, {
        skillId: skill.id,
        agentConfigurationId: agent.id,
      });
    }
    const visibleParent = await SkillFactory.create(otherAuth, {
      name: "Visible Parent",
      availability: "workspace_users",
    });
    const editorsOnlyParent = await SkillFactory.create(otherAuth, {
      name: "Editors Only Parent",
      availability: "editors",
    });
    for (const parent of [visibleParent, editorsOnlyParent]) {
      await SkillFactory.linkSkillToSkill(otherAuth, {
        parentSkillId: parent.id,
        childSkillId: skill.id,
      });
    }

    const response = await usedByRequest(workspace.sId, {
      skillIds: [skill.sId, editorsOnlyParent.sId],
    });

    expect(response.status).toBe(200);
    const body: PostSkillsUsedByResponseBody = await response.json();
    expect(body.usedBy).toEqual({
      [skill.sId]: {
        count: 2,
        agents: [
          {
            sId: visibleAgent.sId,
            name: "Visible Agent",
            pictureUrl: visibleAgent.pictureUrl,
          },
        ],
        skills: [
          {
            sId: visibleParent.sId,
            name: "Visible Parent",
            icon: visibleParent.icon,
          },
        ],
      },
    });
  });
});
