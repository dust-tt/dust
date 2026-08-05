import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { SeedContext } from "@app/scripts/seed/factories";
import { seedAgents, seedSkill, seedUsers } from "@app/scripts/seed/factories";
import type { Assets } from "@app/scripts/seed/governance/seed";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const ALFRED_USER_ID = "SeedUserAlfred";

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

    const alfredSkill = await seedSkill(ctx, assets.skills.alfredSkill, {
      owner: alfred,
    });
    const currentUserSkill = await seedSkill(
      ctx,
      assets.skills.currentUserSkill
    );
    const createdAgents = await seedAgents(ctx, assets.agents, {
      skills: alfredSkill ? [alfredSkill] : [],
    });

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
    expect(createdAgents.size).toBe(assets.agents.length);
    const agent = createdAgents.get(assets.agents[0].name);
    expect(agent).toBeDefined();

    const agentConfiguration = await getAgentConfiguration(authenticator, {
      agentId: agent!.sId,
      variant: "full",
    });
    expect(agentConfiguration).toBeDefined();
    const agentSkills = await SkillResource.listByAgentConfiguration(
      authenticator,
      agentConfiguration!
    );
    expect(agentSkills.map((s) => s.sId)).toEqual([alfredSkill!.sId]);
  });
});
