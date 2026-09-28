import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type {
  ScheduleConfig,
  TriggerExecutionMode,
  TriggerStatus,
  WebhookConfig,
} from "@app/types/assistant/triggers";
import type { ModelId } from "@app/types/shared/model_id";
import { faker } from "@faker-js/faker";
import assert from "assert";

interface WebhookTriggerOptions {
  agentConfigurationId: string;
  name?: string;
  status?: TriggerStatus;
  configuration?: WebhookConfig;
  webhookSourceViewId?: ModelId | null;
  customPrompt?: string | null;
  spaceId?: ModelId | null;
  executionMode?: TriggerExecutionMode;
}

interface ScheduleTriggerOptions {
  agentConfigurationId: string;
  name?: string;
  status?: TriggerStatus;
  configuration: ScheduleConfig;
  customPrompt?: string | null;
  executionMode?: TriggerExecutionMode;
}

async function fetchAgent(
  auth: Authenticator,
  agentId: string
): Promise<AgentResource> {
  const agent = await AgentResource.fetchById(auth, agentId);
  assert(agent, `Agent ${agentId} not found`);
  return agent;
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
      agent: await fetchAgent(auth, options.agentConfigurationId),
      editor: user.id,
      customPrompt: options.customPrompt ?? null,
      status: options.status ?? "disabled",
      configuration: options.configuration ?? { includePayload: true },
      webhookSourceViewId: options.webhookSourceViewId ?? null,
      spaceId: options.spaceId ?? null,
      origin: "user",
      executionMode: options.executionMode,
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
      agent: await fetchAgent(auth, options.agentConfigurationId),
      editor: user.id,
      customPrompt: options.customPrompt ?? null,
      status: options.status ?? "disabled",
      configuration: options.configuration,
      webhookSourceViewId: null,
      origin: "user",
      executionMode: options.executionMode,
    });

    if (result.isErr()) {
      throw result.error;
    }

    return result.value;
  }
}
