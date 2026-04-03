import { TriggerResource } from "@app/lib/resources/trigger_resource";

import type { CreatedWebhookSourceView } from "./seedWebhookSources";
import type { CreatedAgent, SeedContext } from "./types";

export interface ScheduleTriggerAsset {
  name: string;
  kind: "schedule";
  agentName: string;
  customPrompt: string | null;
  status: "enabled" | "disabled";
  configuration: {
    cron: string;
    timezone: string;
  };
}

export interface WebhookTriggerAsset {
  name: string;
  kind: "webhook";
  agentName: string;
  webhookSourceName: string;
  customPrompt: string | null;
  status: "enabled" | "disabled";
  configuration: {
    includePayload: boolean;
    event?: string;
    filter?: string;
  };
}

export type TriggerAsset = ScheduleTriggerAsset | WebhookTriggerAsset;

export interface SeedTriggersOptions {
  webhookSources?: Map<string, CreatedWebhookSourceView>;
}

export async function seedTriggers(
  ctx: SeedContext,
  triggerAssets: TriggerAsset[],
  agents: Map<string, CreatedAgent>,
  options: SeedTriggersOptions = {}
): Promise<void> {
  const { auth, execute, logger } = ctx;
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();
  const { webhookSources } = options;

  for (const asset of triggerAssets) {
    const agent = agents.get(asset.agentName);
    if (!agent) {
      logger.warn(
        { agentName: asset.agentName },
        "Agent not found for trigger, skipping"
      );
      continue;
    }

    // Resolve webhook source view ID for webhook triggers
    let webhookSourceViewId: number | null = null;
    if (asset.kind === "webhook") {
      const view = webhookSources?.get(asset.webhookSourceName);
      if (!view) {
        logger.warn(
          {
            webhookSourceName: asset.webhookSourceName,
            triggerName: asset.name,
          },
          "Webhook source not found for trigger, skipping"
        );
        continue;
      }
      webhookSourceViewId = view.viewId;
    }

    // Check if trigger already exists
    const existing = await TriggerResource.listByAgentConfigurationId(
      auth,
      agent.sId
    );
    const existingTrigger = existing.find((t) => t.name === asset.name);
    if (existingTrigger) {
      logger.info(
        { name: asset.name, agentName: asset.agentName },
        "Trigger already exists, skipping"
      );
      continue;
    }

    if (execute) {
      const result = await TriggerResource.makeNew(auth, {
        workspaceId: workspace.id,
        name: asset.name,
        kind: asset.kind,
        agentConfigurationId: agent.sId,
        editor: user.id,
        customPrompt: asset.customPrompt,
        status: asset.status,
        configuration: asset.configuration,
        webhookSourceViewId,
        origin: "user",
      });

      if (result.isErr()) {
        throw result.error;
      }

      logger.info(
        { name: asset.name, kind: asset.kind, agentName: asset.agentName },
        "Trigger created"
      );
    } else {
      logger.info(
        { name: asset.name, kind: asset.kind, agentName: asset.agentName },
        "Would create trigger (dry run)"
      );
    }
  }
}
