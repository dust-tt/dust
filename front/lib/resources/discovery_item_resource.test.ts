import { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { DiscoveryItemResource } from "@app/lib/resources/discovery_item_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import assert from "assert";
import { beforeEach, describe, expect, it } from "vitest";

describe("DiscoveryItemResource", () => {
  let auth: Authenticator;
  let agentAId: string;
  let agentBId: string;
  let groupModelId: number;
  let globalSpaceModelId: number;
  let skill: SkillResource;
  let skillId: string;
  let user: UserResource;

  beforeEach(async () => {
    const setup = await createResourceTest({ role: "admin" });
    auth = setup.authenticator;
    groupModelId = setup.globalGroup.id;
    globalSpaceModelId = setup.globalSpace.id;
    user = setup.user;
    agentAId = (
      await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent A",
      })
    ).sId;
    agentBId = (
      await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Agent B",
      })
    ).sId;
    skill = await SkillFactory.create(auth, {
      name: "Skill A",
    });
    skillId = skill.sId;
  });

  it("sets pins independently and lists them by position", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: skillId, position: 2 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentBId, position: 1 },
    });

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map(({ pin }) => pin.position)).toEqual([0, 1, 2]);
    expect(listed.map(({ pin }) => pin.itemId)).toEqual([
      agentAId,
      agentBId,
      skillId,
    ]);
  });

  it("replaces only the selected position", async () => {
    const replacementSkill = await SkillFactory.create(auth, {
      name: "Replacement skill",
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: skillId, position: 1 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: replacementSkill.sId, position: 0 },
    });

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map(({ pin }) => pin.itemId)).toEqual([
      replacementSkill.sId,
      skillId,
    ]);
  });

  it("moves an existing item and removes only the requested position", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: skillId, position: 1 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 2 },
    });
    const removed = await DiscoveryItemResource.removePinnedForGroup(auth, {
      groupModelId,
      position: 1,
    });
    expect(removed.isOk() && removed.value).toBe(1);

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map(({ pin }) => [pin.position, pin.itemId])).toEqual([
      [2, agentAId],
    ]);
  });

  it("rejects an invalid position without changing existing pins", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });

    const rejected = await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: skillId, position: 3 },
    });
    expect(rejected.isErr()).toBe(true);

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map(({ pin }) => pin.itemId)).toEqual([agentAId]);
  });

  it("lists pins across the authenticated groups with the global group first", async () => {
    const group = await GroupFactory.regularManual(
      auth.getNonNullableWorkspace(),
      "Pinned audience"
    );
    await GroupFactory.withMembers(auth, group, [user]);
    await auth.refresh();

    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId: group.id,
      item: { type: "skill", itemId: skillId, position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });

    const listed = await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(listed.map(({ pin }) => pin.itemId)).toEqual([agentAId, skillId]);

    const groupPins = await DiscoveryItemResource.listPinnedForGroup(auth, {
      groupModelId: group.id,
    });
    expect(groupPins.map(({ pin }) => pin.itemId)).toEqual([skillId]);
  });

  it("omits archived targets from every list operation", async () => {
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentBId, position: 1 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: skillId, position: 2 },
    });

    const archivedAgentResource = await AgentResource.fetchById(auth, agentBId);
    assert(archivedAgentResource);
    const archiveResult = await archivedAgentResource.archive(auth);
    assert(archiveResult.isOk());
    await skill.archive(auth);

    const listedForAuth = await DiscoveryItemResource.listPinnedForAuth(auth);
    const listedForGroup = await DiscoveryItemResource.listPinnedForGroup(
      auth,
      { groupModelId }
    );
    expect(listedForAuth.map(({ pin }) => pin.itemId)).toEqual([agentAId]);
    expect(listedForGroup.map(({ pin }) => pin.itemId)).toEqual([agentAId]);
  });

  it("rejects inactive targets when setting a pin", async () => {
    const archivedAgent = await AgentResource.fetchById(auth, agentAId);
    assert(archivedAgent);
    const archiveResult = await archivedAgent.archive(auth);
    assert(archiveResult.isOk());
    await skill.archive(auth);

    const agentResult = await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });
    const skillResult = await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: skillId, position: 1 },
    });

    expect(agentResult.isErr() && agentResult.error.code).toBe(
      "invalid_request_error"
    );
    expect(skillResult.isErr() && skillResult.error.code).toBe(
      "invalid_request_error"
    );
  });

  it("omits targets the user cannot read from every list operation", async () => {
    const privateGroup = await GroupFactory.regularManual(
      auth.getNonNullableWorkspace(),
      "Private skill readers"
    );
    await GroupFactory.withMembers(auth, privateGroup, [user]);
    const privateSpace = await SpaceFactory.regular(
      auth.getNonNullableWorkspace()
    );
    await SpaceFactory.attachGroup(privateSpace, privateGroup);
    await auth.refresh();
    const restrictedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Restricted agent",
        scope: "visible",
        requestedSpaceIds: [privateSpace.id],
      }
    );
    const privateSkill = await SkillFactory.create(auth, {
      name: "Private-space skill",
      requestedSpaceIds: [globalSpaceModelId, privateSpace.id],
    });

    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: restrictedAgent.sId, position: 1 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: privateSkill.sId, position: 2 },
    });

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(
      auth.getNonNullableWorkspace(),
      regularUser,
      { role: "user" }
    );
    const regularUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      regularUser.sId,
      auth.getNonNullableWorkspace().sId
    );

    const listedForAuth =
      await DiscoveryItemResource.listPinnedForAuth(regularUserAuth);
    const listedForGroup = await DiscoveryItemResource.listPinnedForGroup(
      regularUserAuth,
      { groupModelId }
    );
    expect(listedForAuth.map(({ pin }) => pin.itemId)).toEqual([agentAId]);
    expect(listedForGroup.map(({ pin }) => pin.itemId)).toEqual([agentAId]);
  });

  it("rejects a hidden agent", async () => {
    const hiddenAgent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Hidden agent",
      scope: "hidden",
    });

    const result = await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: hiddenAgent.sId, position: 0 },
    });

    expect(result.isErr() && result.error.code).toBe("invalid_request_error");
    expect(
      await DiscoveryItemResource.listPinnedForGroup(auth, { groupModelId })
    ).toEqual([]);
  });

  it("shows an admin pins they cannot read and still refuses to set them", async () => {
    const privateGroup = await GroupFactory.regularManual(
      auth.getNonNullableWorkspace(),
      "Private skill readers"
    );
    await GroupFactory.withMembers(auth, privateGroup, [user]);
    const privateSpace = await SpaceFactory.regular(
      auth.getNonNullableWorkspace()
    );
    await SpaceFactory.attachGroup(privateSpace, privateGroup);
    await auth.refresh();
    const restrictedAgent = await AgentConfigurationFactory.createTestAgent(
      auth,
      {
        name: "Restricted agent",
        description: "Restricted agent description",
        scope: "visible",
        requestedSpaceIds: [privateSpace.id],
      }
    );
    const privateSkill = await SkillFactory.create(auth, {
      name: "Private-space skill",
      userFacingDescription: "Private skill description",
      requestedSpaceIds: [globalSpaceModelId, privateSpace.id],
    });

    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "agent", itemId: restrictedAgent.sId, position: 1 },
    });
    await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId,
      item: { type: "skill", itemId: privateSkill.sId, position: 2 },
    });

    const otherAdmin = await UserFactory.basic();
    await MembershipFactory.associate(
      auth.getNonNullableWorkspace(),
      otherAdmin,
      { role: "admin" }
    );
    const otherAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherAdmin.sId,
      auth.getNonNullableWorkspace().sId
    );

    const adminPins = await DiscoveryItemResource.listPinnedForGroup(
      otherAdminAuth,
      { groupModelId }
    );
    expect(adminPins.map(({ pin }) => pin.itemId)).toEqual([
      agentAId,
      restrictedAgent.sId,
      privateSkill.sId,
    ]);
    const adminCards = adminPins.map((item) =>
      DiscoveryItemResource.toJSON(item)
    );
    const restrictedCard = adminCards.find(
      (item) => item.type === "agent" && item.target.sId === restrictedAgent.sId
    );
    const privateCard = adminCards.find((item) => item.type === "skill");
    assert(restrictedCard?.type === "agent");
    assert(privateCard?.type === "skill");
    expect(restrictedCard.target).toMatchObject({
      name: "Restricted agent",
      description: "Restricted agent description",
    });
    expect(privateCard.target).toMatchObject({
      name: "Private-space skill",
      description: "Private skill description",
    });

    const featuredForReader =
      await DiscoveryItemResource.listPinnedForAuth(auth);
    expect(featuredForReader.map(({ pin }) => pin.itemId)).toEqual([
      agentAId,
      restrictedAgent.sId,
      privateSkill.sId,
    ]);
    const featuredForAdmin =
      await DiscoveryItemResource.listPinnedForAuth(otherAdminAuth);
    expect(featuredForAdmin.map(({ pin }) => pin.itemId)).toEqual([agentAId]);

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(
      auth.getNonNullableWorkspace(),
      regularUser,
      { role: "user" }
    );
    const regularUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      regularUser.sId,
      auth.getNonNullableWorkspace().sId
    );
    expect(
      (await DiscoveryItemResource.listPinnedForAuth(regularUserAuth)).map(
        ({ pin }) => pin.itemId
      )
    ).toEqual([agentAId]);

    const agentWrite = await DiscoveryItemResource.setPinnedForGroup(
      otherAdminAuth,
      {
        groupModelId,
        item: { type: "agent", itemId: restrictedAgent.sId, position: 0 },
      }
    );
    const skillWrite = await DiscoveryItemResource.setPinnedForGroup(
      otherAdminAuth,
      {
        groupModelId,
        item: { type: "skill", itemId: privateSkill.sId, position: 0 },
      }
    );
    expect(agentWrite.isErr() && agentWrite.error.code).toBe(
      "invalid_request_error"
    );
    expect(skillWrite.isErr() && skillWrite.error.code).toBe(
      "invalid_request_error"
    );
    expect(
      (
        await DiscoveryItemResource.listPinnedForGroup(auth, { groupModelId })
      ).map(({ pin }) => pin.itemId)
    ).toEqual([agentAId, restrictedAgent.sId, privateSkill.sId]);
  });

  it("rejects pins on regular_auto groups", async () => {
    const autoGroup = await GroupFactory.regularAuto(
      auth.getNonNullableWorkspace(),
      "Agent editors"
    );

    const result = await DiscoveryItemResource.setPinnedForGroup(auth, {
      groupModelId: autoGroup.id,
      item: { type: "agent", itemId: agentAId, position: 0 },
    });

    expect(result.isErr() && result.error.code).toBe("invalid_request_error");
    const listed = await DiscoveryItemResource.listPinnedForGroup(auth, {
      groupModelId: autoGroup.id,
    });
    expect(listed).toEqual([]);
  });

  it("rejects pin mutations from workspace managers", async () => {
    const setup = await createResourceTest({ role: "manager" });

    const result = await DiscoveryItemResource.setPinnedForGroup(
      setup.authenticator,
      {
        groupModelId: setup.globalGroup.id,
        item: { type: "agent", itemId: "agt_forbidden", position: 0 },
      }
    );
    const removeResult = await DiscoveryItemResource.removePinnedForGroup(
      setup.authenticator,
      {
        groupModelId: setup.globalGroup.id,
        position: 0,
      }
    );

    expect(result.isErr() && result.error.code).toBe("unauthorized");
    expect(removeResult.isErr() && removeResult.error.code).toBe(
      "unauthorized"
    );
  });
});
