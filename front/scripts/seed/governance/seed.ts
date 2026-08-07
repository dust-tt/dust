import { setWorkspaceGovernancePermission } from "@app/lib/api/permissions/governance";
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
  seedSpace,
  seedUsers,
} from "@app/scripts/seed/factories";
import { seedGovernanceGroups } from "@app/scripts/seed/governance/groups";
import { removeNulls } from "@app/types/shared/utils/general";
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
const BOB_USER_ID = "SeedUserBob";
const CHARLY_USER_ID = "SeedUserCharly";
const RESTRICTED_SPACE_NAME = "Governance Restricted Space";

makeScript({}, async ({ execute }, logger) => {
  const { agents, users, skills } = loadAssets();

  const ctx = await createSeedContext({ execute, logger });

  // 1. Create Alfred, Bob and Charly as regular workspace members.
  logger.info("Seeding users...");
  const createdUsers = await seedUsers(ctx, users);
  const alfred = createdUsers.get(ALFRED_USER_ID);
  if (execute && !alfred) {
    throw new Error(`User ${ALFRED_USER_ID} was not created`);
  }

  const bob = createdUsers.get(BOB_USER_ID);
  if (execute && !bob) {
    throw new Error(`User ${BOB_USER_ID} was not created`);
  }

  const charly = createdUsers.get(CHARLY_USER_ID);
  if (execute && !charly) {
    throw new Error(`User ${CHARLY_USER_ID} was not created`);
  }

  // 2. Create the provisioned and manual groups.
  logger.info("Seeding groups...");
  await seedGovernanceGroups(ctx, { alfred, bob, charly });

  // 3. Create a restricted space holding the current user and Bob.
  logger.info("Seeding the restricted space...");
  const restrictedSpace = await seedSpace(ctx, {
    name: RESTRICTED_SPACE_NAME,
    members: bob ? [bob] : [],
  });

  // 4. Open skill creation to everyone
  logger.info("Opening skill creation to everyone...");
  if (execute) {
    const res = await setWorkspaceGovernancePermission(ctx.auth, {
      grantType: "create",
      resourceType: "skill",
      configuration: { scope: "everyone" },
    });
    if (res.isErr()) {
      throw res.error;
    }
  }

  // 5. Create skills. The current user's skill requires the restricted space and has both Bob and
  // Alfred as editors. Bob is a member of the space, Alfred is not, so the skill builder shows the
  // warning for Alfred only.
  logger.info("Seeding Alfred's unpublished skill...");
  const alfredSkill = await seedSkill(ctx, skills.alfredSkill, {
    owner: alfred,
  });
  logger.info("Seeding the current user's skill...");
  await seedSkill(ctx, skills.currentUserSkill, {
    editors: removeNulls([bob, alfred]),
    spaces: restrictedSpace ? [restrictedSpace] : [],
  });

  // 6. Create an agent edited by the current user that uses Alfred's unpublished skill.
  logger.info("Seeding agents...");
  await seedAgents(ctx, agents, {
    skills: alfredSkill ? [alfredSkill] : [],
  });

  logger.info("Governance seed completed");
});
