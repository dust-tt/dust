import type { Authenticator } from "@app/lib/auth";
import type { TriggerResource } from "@app/lib/resources/trigger_resource";
import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import type { ModelId } from "@app/types";
import type {
  ScheduleConfig,
  TriggerKind,
  TriggerStatus,
  WebhookConfig,
} from "@app/types/assistant/triggers";

interface CreateScheduleTriggerParams {
  name?: string;
  agentConfigurationId: string;
  editorId: ModelId;
  status?: TriggerStatus;
  cron?: string;
  timezone?: string;
  customPrompt?: string | null;
  naturalLanguageDescription?: string | null;
}

interface CreateWebhookTriggerParams {
  name?: string;
  agentConfigurationId: string;
  editorId: ModelId;
  webhookSourceViewId: ModelId;
  status?: TriggerStatus;
  includePayload?: boolean;
  event?: string;
  filter?: string;
  executionMode?: "fair_use" | "programmatic";
  customPrompt?: string | null;
  naturalLanguageDescription?: string | null;
}

export class TriggerFactory {
  private workspaceId: ModelId;

  constructor(workspaceId: ModelId) {
    this.workspaceId = workspaceId;
  }

  async createScheduleTrigger(
    params: CreateScheduleTriggerParams
  ): Promise<TriggerModel> {
    const {
      name = "Test Schedule Trigger",
      agentConfigurationId,
      editorId,
      status = "enabled",
      cron = "0 9 * * *", // Every day at 9 AM
      timezone = "UTC",
      customPrompt = null,
      naturalLanguageDescription = null,
    } = params;

    const configuration: ScheduleConfig = {
      cron,
      timezone,
    };

    const trigger = await TriggerModel.create({
      workspaceId: this.workspaceId,
      name,
      agentConfigurationId,
      editor: editorId,
      kind: "schedule" as TriggerKind,
      status,
      configuration,
      origin: "user",
      customPrompt,
      naturalLanguageDescription,
      webhookSourceViewId: null,
      executionPerDayLimitOverride: null,
      executionMode: null,
    });

    return trigger;
  }

  async createWebhookTrigger(
    params: CreateWebhookTriggerParams
  ): Promise<TriggerModel> {
    const {
      name = "Test Webhook Trigger",
      agentConfigurationId,
      editorId,
      webhookSourceViewId,
      status = "enabled",
      includePayload = false,
      event,
      filter,
      executionMode = "fair_use",
      customPrompt = null,
      naturalLanguageDescription = null,
    } = params;

    const configuration: WebhookConfig = {
      includePayload,
      event,
      filter,
    };

    const trigger = await TriggerModel.create({
      workspaceId: this.workspaceId,
      name,
      agentConfigurationId,
      editor: editorId,
      kind: "webhook" as TriggerKind,
      status,
      configuration,
      origin: "user",
      customPrompt,
      naturalLanguageDescription,
      webhookSourceViewId,
      executionPerDayLimitOverride: null,
      executionMode,
    });

    return trigger;
  }
}
