import { faker } from "@faker-js/faker";

import type { Authenticator } from "@app/lib/auth";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type {
  ScheduleConfig,
  TriggerStatus,
  WebhookConfig,
} from "@app/types/assistant/triggers";
import type { ModelId } from "@app/types/shared/model_id";

interface WebhookTriggerOptions {
  agentConfigurationId: string;
  name?: string;
  status?: TriggerStatus;
  configuration?: WebhookConfig;
  webhookSourceViewId?: ModelId | null;
  customPrompt?: string | null;
}

interface ScheduleTriggerOptions {
  agentConfigurationId: string;
  name?: string;
  status?: TriggerStatus;
  configuration: ScheduleConfig;
  customPrompt?: string | null;
}

export class TriggerFactory {
  /**
   * Creates a webhook trigger for tests.
   * Status defaults to "disabled" to avoid temporal workflow side effects.
   */
  static async webhook(
    auth: Authenticator,
    options: WebhookTriggerOptions
  ): Promise<TriggerResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const result = await TriggerResource.makeNew(auth, {
      workspaceId: workspace.id,
      name: options.name ?? `trigger-${faker.string.alphanumeric(8)}`,
      kind: "webhook",
      agentConfigurationId: options.agentConfigurationId,
      editor: user.id,
      customPrompt: options.customPrompt ?? null,
      status: options.status ?? "disabled",
      configuration: options.configuration ?? { includePayload: true },
      webhookSourceViewId: options.webhookSourceViewId ?? null,
      origin: "user",
    });

    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }

  /**
   * Creates a schedule trigger for tests.
   * Status defaults to "disabled" to avoid temporal workflow side effects.
   */
  static async schedule(
    auth: Authenticator,
    options: ScheduleTriggerOptions
  ): Promise<TriggerResource> {
    const workspace = auth.getNonNullableWorkspace();
    const user = auth.getNonNullableUser();

    const result = await TriggerResource.makeNew(auth, {
      workspaceId: workspace.id,
      name: options.name ?? `trigger-${faker.string.alphanumeric(8)}`,
      kind: "schedule",
      agentConfigurationId: options.agentConfigurationId,
      editor: user.id,
      customPrompt: options.customPrompt ?? null,
      status: options.status ?? "disabled",
      configuration: options.configuration,
      webhookSourceViewId: null,
      origin: "user",
    });

    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }
}
