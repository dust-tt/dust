import { makeScript } from "@app/scripts/helpers";
import type {
  AgentAsset,
  SkillAsset,
  UserAsset,
} from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedAgents,
  seedSkill,
  seedUsers,
} from "@app/scripts/seed/factories";
import * as fs from "fs";
import * as path from "path";

export interface Assets {
  agents: AgentAsset[];
  users: UserAsset[];
  skills: {
    alfredSkill: SkillAsset;
    currentUserSkill: SkillAsset;
  };
}

// Load assets from JSON files
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

const ALFRED_USER_ID = "SeedUserAlfred";

makeScript({}, async ({ execute }, logger) => {
  const { agents, users, skills } = loadAssets();

  const ctx = await createSeedContext({ execute, logger });

  // 1. Create Alfred and Bob as regular workspace members.
  logger.info("Seeding users...");
  const createdUsers = await seedUsers(ctx, users);
  const alfred = createdUsers.get(ALFRED_USER_ID);
  if (execute && !alfred) {
    throw new Error(`User ${ALFRED_USER_ID} was not created`);
  }

  // 2. Create skills
  logger.info("Seeding Alfred's unpublished skill...");
  const alfredSkill = await seedSkill(ctx, skills.alfredSkill, {
    owner: alfred,
  });
  logger.info("Seeding the current user's skill...");
  await seedSkill(ctx, skills.currentUserSkill);

  // 2. Create an agent edited by the current user that uses Alfred's unpublished skill.
  logger.info("Seeding agents...");
  await seedAgents(ctx, agents, {
    skills: alfredSkill ? [alfredSkill] : [],
  });

  logger.info("Governance seed completed");
});
