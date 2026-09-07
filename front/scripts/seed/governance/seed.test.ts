import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { SeedContext } from "@app/scripts/seed/factories";
import {
  seedAgent,
  seedSkill,
  seedSpace,
  seedUsers,
} from "@app/scripts/seed/factories";
import {
  DEV_TEAM_GROUP_NAME,
  FRANCE_GROUP_NAME,
  GO_TO_MARKET_GROUP_NAME,
  LONG_NAME_GROUP_NAME,
  seedGovernanceGroups,
} from "@app/scripts/seed/governance/groups";
import type { Assets } from "@app/scripts/seed/governance/seed";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const ALFRED_USER_ID = "SeedUserAlfred";
const BOB_USER_ID = "SeedUserBob";
const CHARLY_USER_ID = "SeedUserCharly";
const RESTRICTED_SPACE_NAME = "Governance Restricted Space";
const PRIVATE_SPACE_NAME = "Governance Private Space";

// Load assets from JSON files (same as seed.ts)
function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const agents = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "agents.json"), "utf-8")
  );
  const users = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "users.json"), "utf-8")
  );
  const skills = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "skills.json"), "utf-8")
  );
  return { agents, users, skills };
}

describe("governance seed script integration test", () => {
  const assets = loadAssets();

  it("should create the users, skills and agent", async () => {
    const { workspace, user, authenticator } = await createResourceTest({
      role: "admin",
    });

    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    // Run the seed flow (same order as seed.ts).
    const createdUsers = await seedUsers(ctx, assets.users);
    const alfred = createdUsers.get(ALFRED_USER_ID);
    expect(createdUsers.size).toBe(assets.users.length);
    expect(alfred).toBeDefined();

    const bob = createdUsers.get(BOB_USER_ID);
    expect(bob).toBeDefined();

    const charly = createdUsers.get(CHARLY_USER_ID);
    expect(charly).toBeDefined();

    const groups = await seedGovernanceGroups(ctx, { alfred, bob, charly });

    const restrictedSpace = await seedSpace(ctx, {
      name: RESTRICTED_SPACE_NAME,
      members: [bob!],
    });
    const privateSpace = await seedSpace(ctx, {
      name: PRIVATE_SPACE_NAME,
      members: [alfred!],
      withContextUser: false,
    });

    const alfredSkill = await seedSkill(ctx, assets.skills.alfredSkill, {
      owner: alfred,
    });
    const alfredPrivateSpaceSkill = await seedSkill(
      ctx,
      assets.skills.alfredPrivateSpaceSkill,
      { owner: alfred, spaces: privateSpace ? [privateSpace] : [] }
    );
    const currentUserSkill = await seedSkill(
      ctx,
      assets.skills.currentUserSkill,
      {
        editors: [bob!, alfred!],
        spaces: restrictedSpace ? [restrictedSpace] : [],
      }
    );
    const incidentReporter = await seedAgent(
      ctx,
      assets.agents.incidentReporter,
      {
        skills: alfredSkill ? [alfredSkill] : [],
      }
    );
    const alfredUnpublishedAgent = await seedAgent(
      ctx,
      assets.agents.alfredUnpublishedAgent,
      { owner: alfred }
    );
    const alfredPrivateSpaceAgent = await seedAgent(
      ctx,
      assets.agents.alfredPrivateSpaceAgent,
      { owner: alfred, spaces: privateSpace ? [privateSpace] : [] }
    );
    const alfredUnpublishedPrivateSpaceAgent = await seedAgent(
      ctx,
      assets.agents.alfredUnpublishedPrivateSpaceAgent,
      { owner: alfred, spaces: privateSpace ? [privateSpace] : [] }
    );

    // The groups hold the expected members, with the expected kinds.
    for (const [name, kind, expectedMembers] of [
      [DEV_TEAM_GROUP_NAME, "provisioned", [user.sId, alfred!.sId]],
      [GO_TO_MARKET_GROUP_NAME, "provisioned", [alfred!.sId, bob!.sId]],
      [FRANCE_GROUP_NAME, "regular_manual", [user.sId, charly!.sId]],
      [LONG_NAME_GROUP_NAME, "regular_manual", [user.sId]],
    ] as const) {
      const group = groups.get(name);
      expect(group).toBeDefined();
      expect(group!.kind).toBe(kind);
      const groupMembers = await group!.getActiveMembers(authenticator);
      expect(new Set(groupMembers.map((m) => m.sId))).toEqual(
        new Set(expectedMembers)
      );
    }

    // The restricted space holds the current user and Bob.
    expect(restrictedSpace).toBeDefined();
    expect(await restrictedSpace!.isRestricted(authenticator)).toBe(true);
    const spaceMembers =
      await restrictedSpace!.fetchDistinctActiveManualGroupMembers(
        authenticator
      );
    expect(new Set(spaceMembers.map((m) => m.sId))).toEqual(
      new Set([user.sId, bob!.sId])
    );

    // The current user's skill requires the restricted space and has Bob and Alfred as editors.
    // Alfred is not a member of the space, which is what the skill builder warns about.
    expect(currentUserSkill!.requestedSpaceIds).toEqual([restrictedSpace!.id]);
    const skillEditors = (await currentUserSkill!.listEditors(authenticator))!;
    expect(new Set(skillEditors.map((e) => e.sId))).toEqual(
      new Set([user.sId, bob!.sId, alfred!.sId])
    );
    expect(spaceMembers.map((m) => m.sId)).not.toContain(alfred!.sId);

    // Alfred's published skill requires the private space the current user is not a member of.
    expect(alfredPrivateSpaceSkill).toBeDefined();
    expect(alfredPrivateSpaceSkill!.requestedSpaceIds).toEqual([
      privateSpace!.id,
    ]);
    expect(alfredPrivateSpaceSkill!.availability).toBe("workspace_users");

    // Both skills are created with the availability from the assets.
    expect(alfredSkill).toBeDefined();
    expect(alfredSkill!.name).toBe(assets.skills.alfredSkill.name);
    expect(alfredSkill!.availability).toBe(
      assets.skills.alfredSkill.availability
    );

    expect(currentUserSkill).toBeDefined();
    expect(currentUserSkill!.name).toBe(assets.skills.currentUserSkill.name);
    expect(currentUserSkill!.availability).toBe(
      assets.skills.currentUserSkill.availability
    );

    // The agent is created and uses Alfred's skill.
    expect(incidentReporter).toBeDefined();

    const agentConfiguration = await getAgentConfiguration(authenticator, {
      agentId: incidentReporter!.sId,
      variant: "full",
    });
    expect(agentConfiguration).toBeDefined();
    const agentSkills = await SkillResource.listByAgentConfiguration(
      authenticator,
      agentConfiguration!
    );
    expect(agentSkills.map((s) => s.sId)).toEqual([alfredSkill!.sId]);

    // The private space holds Alfred only: the current user is not a member.
    expect(privateSpace).toBeDefined();
    expect(await privateSpace!.isRestricted(authenticator)).toBe(true);
    const privateSpaceMembers =
      await privateSpace!.fetchDistinctActiveManualGroupMembers(authenticator);
    expect(new Set(privateSpaceMembers.map((m) => m.sId))).toEqual(
      new Set([alfred!.sId])
    );

    // Alfred's three agents are authored by Alfred: unpublished for the first one, requiring the
    // private space for the second one, and both for the third one. None shows up in the current
    // user's list view.
    expect(alfredUnpublishedAgent).toBeDefined();
    expect(alfredPrivateSpaceAgent).toBeDefined();
    expect(alfredUnpublishedPrivateSpaceAgent).toBeDefined();

    const alfredAuth = await Authenticator.fromUserIdAndWorkspaceId(
      alfred!.sId,
      workspace.sId
    );
    const unpublishedConfiguration = await getAgentConfiguration(alfredAuth, {
      agentId: alfredUnpublishedAgent!.sId,
      variant: "light",
    });
    expect(unpublishedConfiguration!.scope).toBe("hidden");
    expect(unpublishedConfiguration!.versionAuthorId).toBe(alfred!.id);

    const privateSpaceConfiguration = await getAgentConfiguration(alfredAuth, {
      agentId: alfredPrivateSpaceAgent!.sId,
      variant: "light",
    });
    expect(privateSpaceConfiguration!.scope).toBe("visible");
    expect(privateSpaceConfiguration!.versionAuthorId).toBe(alfred!.id);
    expect(privateSpaceConfiguration!.requestedSpaceIds).toEqual([
      privateSpace!.sId,
    ]);

    const unpublishedPrivateSpaceConfiguration = await getAgentConfiguration(
      alfredAuth,
      {
        agentId: alfredUnpublishedPrivateSpaceAgent!.sId,
        variant: "light",
      }
    );
    expect(unpublishedPrivateSpaceConfiguration!.scope).toBe("hidden");
    expect(unpublishedPrivateSpaceConfiguration!.versionAuthorId).toBe(
      alfred!.id
    );
    expect(unpublishedPrivateSpaceConfiguration!.requestedSpaceIds).toEqual([
      privateSpace!.sId,
    ]);
  });
});
