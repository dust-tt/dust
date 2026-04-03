import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import logger from "@app/logger/logger";
import type { SeedContext } from "@app/scripts/seed/factories";
import {
  seedAgents,
  seedTriggers,
  seedWebhookSources,
} from "@app/scripts/seed/factories";
import type { Assets } from "@app/scripts/seed/triggers/seed";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightWorkspaceType } from "@app/types/user";
import * as fs from "fs";
import * as path from "path";
import { beforeEach, describe, expect, it } from "vitest";

function loadAssets(): Assets {
  const assetsDir = path.join(__dirname, "assets");
  const triggers = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "triggers.json"), "utf-8")
  );
  const webhookSources = JSON.parse(
    fs.readFileSync(path.join(assetsDir, "webhook-sources.json"), "utf-8")
  );
  const basicsAssetsDir = path.join(__dirname, "..", "basics", "assets");
  const agents = JSON.parse(
    fs.readFileSync(path.join(basicsAssetsDir, "agent.json"), "utf-8")
  );
  return { agents, triggers, webhookSources };
}

describe("triggers seed script integration test", () => {
  let workspace: LightWorkspaceType;
  let user: UserResource;
  let authenticator: Authenticator;

  const assets = loadAssets();

  beforeEach(async () => {
    const testResources = await createResourceTest({ role: "admin" });
    workspace = testResources.workspace;
    user = testResources.user;
    authenticator = testResources.authenticator;
  });

  it("should create webhook sources, views, and triggers", async () => {
    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    // Create agents
    const createdAgents = await seedAgents(ctx, assets.agents);
    expect(createdAgents.size).toBe(assets.agents.length);

    // Create webhook sources
    const createdWebhookSources = await seedWebhookSources(
      ctx,
      assets.webhookSources
    );
    expect(createdWebhookSources.size).toBe(assets.webhookSources.length);

    // Verify webhook sources exist
    for (const wsAsset of assets.webhookSources) {
      const ws = await WebhookSourceResource.fetchByName(
        authenticator,
        wsAsset.name
      );
      expect(ws).toBeDefined();
      expect(ws!.provider).toBe(wsAsset.provider);
    }

    // Create triggers
    await seedTriggers(ctx, assets.triggers, createdAgents, {
      webhookSources: createdWebhookSources,
    });

    // Verify all triggers were created
    for (const triggerAsset of assets.triggers) {
      const agent = createdAgents.get(triggerAsset.agentName);
      expect(agent).toBeDefined();

      const triggers = await TriggerResource.listByAgentConfigurationId(
        authenticator,
        agent!.sId
      );
      const found = triggers.find((t) => t.name === triggerAsset.name);
      expect(found).toBeDefined();
      expect(found!.kind).toBe(triggerAsset.kind);
      expect(found!.status).toBe(triggerAsset.status);
      expect(found!.customPrompt).toBe(triggerAsset.customPrompt);

      if (triggerAsset.kind === "webhook") {
        expect(found!.webhookSourceViewId).not.toBeNull();
      }
    }
  });

  it("should be idempotent — running twice does not create duplicates", async () => {
    const ctx: SeedContext = {
      auth: authenticator,
      workspace,
      user,
      execute: true,
      logger,
    };

    const createdAgents = await seedAgents(ctx, assets.agents);
    const createdWebhookSources = await seedWebhookSources(
      ctx,
      assets.webhookSources
    );

    // Run twice
    await seedTriggers(ctx, assets.triggers, createdAgents, {
      webhookSources: createdWebhookSources,
    });
    await seedTriggers(ctx, assets.triggers, createdAgents, {
      webhookSources: createdWebhookSources,
    });

    // Count total triggers across all agents
    let totalTriggers = 0;
    for (const agent of createdAgents.values()) {
      const triggers = await TriggerResource.listByAgentConfigurationId(
        authenticator,
        agent.sId
      );
      totalTriggers += triggers.length;
    }

    expect(totalTriggers).toBe(assets.triggers.length);

    // Webhook sources should also be idempotent
    const secondRun = await seedWebhookSources(ctx, assets.webhookSources);
    expect(secondRun.size).toBe(assets.webhookSources.length);
  });
});
