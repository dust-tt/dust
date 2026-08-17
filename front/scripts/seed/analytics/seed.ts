import { makeScript } from "@app/scripts/helpers";
import { seedHiddenAgent } from "@app/scripts/seed/analytics/hiddenAgent";
import type {
  AgentAsset,
  SkillAsset,
  TriggerAsset,
  UserAsset,
  WebhookSourceAsset,
} from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedAgents,
  seedConsumptionAnalytics,
  seedGroup,
  seedSkill,
  seedTriggers,
  seedUsers,
  seedWebhookSources,
} from "@app/scripts/seed/factories";
import { removeNulls } from "@app/types/shared/utils/general";
import * as fs from "fs";
import * as path from "path";

interface Assets {
  agents: AgentAsset[];
  skills: SkillAsset[];
  triggers: TriggerAsset[];
  users: UserAsset[];
  webhookSources: WebhookSourceAsset[];
}

function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const read = (file: string) =>
    JSON.parse(fs.readFileSync(path.join(assetsDir, file), "utf-8"));
  return {
    agents: read("agents.json"),
    skills: read("skills.json"),
    triggers: read("triggers.json"),
    users: read("users.json"),
    webhookSources: read("webhook-sources.json"),
  };
}

const ENGINEERING_GROUP_NAME = "Analytics Engineering";
const SALES_GROUP_NAME = "Analytics Sales";
// Owns the hidden agent, so it is attributed to someone the admin does not edit.
const HIDDEN_AGENT_OWNER_ID = "SeedUserSacha";

makeScript(
  {
    daysBack: {
      type: "number",
      default: 90,
      description: "Size of the window the consumption is spread over",
    },
    messagesPerDay: {
      type: "number",
      default: 12,
      description: "Base number of agent messages per day",
    },
  },
  async ({ daysBack, messagesPerDay, execute }, logger) => {
    const { agents, skills, triggers, users, webhookSources } = loadAssets();

    const ctx = await createSeedContext({ execute, logger });

    // 1. Members to attribute consumption to.
    logger.info("Seeding users...");
    const createdUsers = await seedUsers(ctx, users);
    const usersById = (ids: string[]) =>
      removeNulls(ids.map((id) => createdUsers.get(id)));

    // 2. Two overlapping teams, so the Teams tab ranks more than one group and
    // some members belong to both.
    logger.info("Seeding groups...");
    await seedGroup(ctx, {
      name: ENGINEERING_GROUP_NAME,
      kind: "provisioned",
      members: [
        ctx.user,
        ...usersById(["SeedUserNora", "SeedUserMilo", "SeedUserTheo"]),
      ],
    });
    await seedGroup(ctx, {
      name: SALES_GROUP_NAME,
      kind: "regular_manual",
      members: usersById([
        "SeedUserInes",
        "SeedUserTheo",
        HIDDEN_AGENT_OWNER_ID,
      ]),
    });

    // 3. Skills, which tool consumption is attributed to.
    logger.info("Seeding skills...");
    const createdSkills = [];
    for (const skill of skills) {
      createdSkills.push(await seedSkill(ctx, skill));
    }

    // 4. Enough agents for the rankings to have a long tail and an "others"
    // series in the chart.
    logger.info("Seeding agents...");
    const createdAgents = await seedAgents(ctx, agents, {
      skills: removeNulls(createdSkills),
    });

    logger.info("Seeding the hidden agent...");
    await seedHiddenAgent(ctx, {
      owner: createdUsers.get(HIDDEN_AGENT_OWNER_ID),
    });

    // 5. Triggers, which the automated share of the consumption is attributed
    // to. They stay disabled: the seed fabricates their consumption rather than
    // letting Temporal actually run them.
    logger.info("Seeding webhook sources...");
    const createdWebhookSources = await seedWebhookSources(ctx, webhookSources);

    logger.info("Seeding triggers...");
    const createdTriggers = await seedTriggers(ctx, triggers, createdAgents, {
      webhookSources: createdWebhookSources,
    });

    // 6. The consumption documents themselves.
    logger.info("Seeding consumption analytics...");
    await seedConsumptionAnalytics(ctx, {
      daysBack,
      messagesPerDay,
      triggerIds: [...createdTriggers.values()].map((trigger) => trigger.sId),
    });

    logger.info("Analytics seed completed");
  }
);
