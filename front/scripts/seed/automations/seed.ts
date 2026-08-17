import { makeScript } from "@app/scripts/helpers";
import type {
  TriggerAsset,
  WebhookSourceAsset,
} from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedAgents,
  seedConsumptionAnalytics,
  seedTriggers,
  seedWebhookSources,
} from "@app/scripts/seed/factories";
import type { AgentAsset } from "@app/scripts/seed/factories/types";
import * as fs from "fs";
import * as path from "path";

interface Assets {
  agents: AgentAsset[];
  triggers: TriggerAsset[];
  webhookSources: WebhookSourceAsset[];
}

function loadAssets(): Assets {
  // Reuses the triggers seed's own assets instead of duplicating them.
  const triggersAssetsDir = path.join(__dirname, "..", "triggers", "assets");
  const basicsAssetsDir = path.join(__dirname, "..", "basics", "assets");
  const read = (dir: string, file: string) =>
    JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));

  return {
    agents: read(basicsAssetsDir, "agent.json"),
    triggers: read(triggersAssetsDir, "triggers.json"),
    webhookSources: read(triggersAssetsDir, "webhook-sources.json"),
  };
}

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
    const {
      agents: agentAssets,
      triggers: triggerAssets,
      webhookSources: webhookSourceAssets,
    } = loadAssets();

    const ctx = await createSeedContext({ execute, logger });

    logger.info("Seeding agents...");
    const createdAgents = await seedAgents(ctx, agentAssets);

    logger.info("Seeding webhook sources...");
    const createdWebhookSources = await seedWebhookSources(
      ctx,
      webhookSourceAssets
    );

    logger.info("Seeding triggers...");
    const createdTriggers = await seedTriggers(
      ctx,
      triggerAssets,
      createdAgents,
      {
        webhookSources: createdWebhookSources,
      }
    );

    logger.info(
      "Seeding consumption analytics attributed to those triggers..."
    );
    await seedConsumptionAnalytics(ctx, {
      daysBack,
      messagesPerDay,
      triggerIds: [...createdTriggers.values()].map((trigger) => trigger.sId),
    });

    logger.info("Automations seed completed");
  }
);
