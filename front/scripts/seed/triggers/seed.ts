import { makeScript } from "@app/scripts/helpers";
import type {
  TriggerAsset,
  WebhookSourceAsset,
} from "@app/scripts/seed/factories";
import {
  createSeedContext,
  seedAgents,
  seedTriggers,
  seedWebhookSources,
} from "@app/scripts/seed/factories";
import type { AgentAsset } from "@app/scripts/seed/factories/types";
import * as fs from "fs";
import * as path from "path";

export interface Assets {
  agents: AgentAsset[];
  triggers: TriggerAsset[];
  webhookSources: WebhookSourceAsset[];
}

function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const triggers = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "triggers.json"), "utf-8")
  );
  const webhookSources = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "webhook-sources.json"), "utf-8")
  );

  // Reuse agents from basics seed
  const basicsAssetsDir = path.join(__dirname, "..", "basics", "assets");
  const agents = JSON.parse(
    fs.readFileSync(path.join(basicsAssetsDir, "agent.json"), "utf-8")
  );

  return { agents, triggers, webhookSources };
}

makeScript({}, async ({ execute }, logger) => {
  const {
    agents: agentAssets,
    triggers: triggerAssets,
    webhookSources: webhookSourceAssets,
  } = loadAssets();

  const ctx = await createSeedContext({ execute, logger });

  // Ensure agents exist (idempotent — skips if already created by basics seed)
  const createdAgents = await seedAgents(ctx, agentAssets);

  // Create webhook sources and their system space views
  const createdWebhookSources = await seedWebhookSources(
    ctx,
    webhookSourceAssets
  );

  // Create triggers (both schedule and webhook)
  await seedTriggers(ctx, triggerAssets, createdAgents, {
    webhookSources: createdWebhookSources,
  });

  logger.info("Triggers seed completed");
});
