import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { listActiveConfigurationIdentities } from "@app/lib/resources/agent_configuration_rows";
import {
  resolveTriggerSpaceId,
  TriggerAgentNotReadableError,
  TriggerExecutionModeForbiddenError,
  TriggerResource,
} from "@app/lib/resources/trigger_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import logger from "@app/logger/logger";
import type {
  TriggerInputType,
  TriggerOrigin,
} from "@app/types/assistant/triggers";
import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

// To use in case of heavy db load emergency with these usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

type WebhookSourcesUsage = Record<ModelId, AgentsUsageType>;

type AgentInfo = { sId: string; name: string; pictureUrl: string };

async function getAccessibleAgentsInfoBySId({
  auth,
}: {
  auth: Authenticator;
}): Promise<Map<string, AgentInfo>> {
  const owner = auth.workspace();

  if (!owner || !auth.isUser()) {
    return new Map();
  }

  const accessibleAgents = await listActiveConfigurationIdentities(auth, {
    usageVisibleOnly: true,
  });

  return new Map(
    accessibleAgents.map((agent) => [
      agent.sId,
      { sId: agent.sId, name: agent.name, pictureUrl: agent.pictureUrl },
    ])
  );
}

async function getTriggersWithAgentAccesibleAgent({
  auth,
  agentInfoById,
}: {
  auth: Authenticator;
  agentInfoById: Map<string, AgentInfo>;
}): Promise<
  Array<{
    webhookSourceViewId: number | string | null;
    agentConfigurationId: string;
  }>
> {
  const owner = auth.workspace();

  if (!owner) {
    return [];
  }

  const triggers = await TriggerResource.listWebhookTriggersForUsageQuery(auth);

  return triggers.filter(
    (trigger) =>
      trigger.webhookSourceViewId !== null &&
      agentInfoById.has(trigger.agentConfigurationId)
  );
}

export async function getWebhookSourcesUsage({
  auth,
}: {
  auth: Authenticator;
}): Promise<WebhookSourcesUsage> {
  const owner = auth.workspace();

  if (!owner || !auth.isUser()) {
    return {};
  }

  if (DISABLE_QUERIES) {
    return {};
  }

  const agentInfoById = await getAccessibleAgentsInfoBySId({ auth });

  if (agentInfoById.size === 0) {
    return {};
  }

  const filteredTriggers = await getTriggersWithAgentAccesibleAgent({
    auth,
    agentInfoById,
  });

  if (filteredTriggers.length === 0) {
    return {};
  }

  const viewIds = Array.from(
    new Set(
      filteredTriggers
        .map((trigger) => Number(trigger.webhookSourceViewId))
        .filter((id) => Number.isFinite(id))
    )
  ) as ModelId[];

  if (viewIds.length === 0) {
    return {};
  }

  const views = await WebhookSourcesViewResource.fetchByModelIds(auth, viewIds);

  const viewToSource = new Map<ModelId, ModelId>();
  views.forEach((view) => {
    viewToSource.set(view.id, view.webhookSourceId);
  });

  if (viewToSource.size === 0) {
    return {};
  }

  const usageMap = new Map<ModelId, Map<string, AgentInfo>>();

  for (const trigger of filteredTriggers) {
    const viewId = Number(trigger.webhookSourceViewId);
    if (!Number.isFinite(viewId)) {
      continue;
    }

    const sourceId = viewToSource.get(viewId);
    if (!sourceId) {
      continue;
    }

    const agentInfo = agentInfoById.get(trigger.agentConfigurationId);
    if (!agentInfo) {
      continue;
    }

    let agentsForSource = usageMap.get(sourceId);
    if (!agentsForSource) {
      agentsForSource = new Map<string, AgentInfo>();
      usageMap.set(sourceId, agentsForSource);
    }

    agentsForSource.set(agentInfo.sId, agentInfo);
  }

  const usage: WebhookSourcesUsage = {};

  usageMap.forEach((agentsMap, sourceId) => {
    const agents = Array.from(agentsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    usage[sourceId] = {
      count: agents.length,
      agents,
    };
  });

  return usage;
}

/**
 * Returns the webhook source views agents can be given triggers on: the views the caller can read
 * or administrate, outside system and conversation spaces, one per webhook source (the most
 * recent), newest first.
 */
export async function getAccessibleWebhookSourceViews(
  auth: Authenticator
): Promise<WebhookSourcesViewResource[]> {
  const views = await WebhookSourcesViewResource.listByWorkspace(auth);
  const usable = views.filter(
    (view) =>
      (auth.can("read", view) || auth.can("admin", view)) &&
      !view.space.isSystem() &&
      !view.space.isConversations()
  );

  const bySourceId = new Map<number, WebhookSourcesViewResource>();
  for (const view of usable) {
    if (!bySourceId.has(view.webhookSourceId)) {
      bySourceId.set(view.webhookSourceId, view);
    }
  }
  return [...bySourceId.values()].sort((a, b) =>
    a.createdAt >= b.createdAt ? -1 : 1
  );
}

export type CreateAgentTriggerError = DustError<
  | "invalid_request_error"
  | "webhook_source_not_found"
  | "unauthorized"
  | "internal_error"
>;

/**
 * @cc [owner:fabiencelier,label:security;product] trigger-owned-by-creator
 * The created trigger MUST have the caller as `editor`: runs execute as them and use their
 * credits. Any `editor` carried by `trigger` is ignored.
 */
/**
 * @cc [owner:fabiencelier,label:security] trigger-references-accessible
 * A trigger MUST NOT be created with a Pod or a webhook source view the caller cannot access:
 * the creation fails with `invalid_request_error` (Pod) or `webhook_source_not_found`
 * (webhook source view) and nothing is persisted.
 */
export async function createAgentTrigger(
  auth: Authenticator,
  {
    agent,
    trigger,
    origin,
  }: {
    agent: AgentResource;
    trigger: TriggerInputType;
    origin: TriggerOrigin;
  }
): Promise<Result<TriggerResource, CreateAgentTriggerError>> {
  const user = auth.getNonNullableUser();

  const spaceIdRes = await resolveTriggerSpaceId(auth, trigger.spaceId);
  if (spaceIdRes.isErr()) {
    return new Err(new DustError("invalid_request_error", spaceIdRes.error));
  }

  let webhookSourceViewId: ModelId | null = null;
  if (trigger.kind === "webhook") {
    const view = await WebhookSourcesViewResource.fetchById(
      auth,
      trigger.webhookSourceViewId
    );
    if (!view) {
      return new Err(
        new DustError(
          "webhook_source_not_found",
          "Webhook source view not found."
        )
      );
    }
    webhookSourceViewId = view.id;
  }

  const res = await TriggerResource.makeNew(auth, {
    workspaceId: auth.getNonNullableWorkspace().id,
    agent,
    name: trigger.name,
    kind: trigger.kind,
    status: trigger.status ?? "enabled",
    configuration: trigger.configuration,
    naturalLanguageDescription: trigger.naturalLanguageDescription,
    customPrompt: trigger.customPrompt,
    editor: user.id,
    webhookSourceViewId,
    executionPerDayLimitOverride:
      trigger.kind === "webhook" ? trigger.executionPerDayLimitOverride : null,
    executionMode: trigger.executionMode,
    origin,
    spaceId: spaceIdRes.value,
  });
  if (res.isErr()) {
    if (
      res.error instanceof TriggerExecutionModeForbiddenError ||
      res.error instanceof TriggerAgentNotReadableError
    ) {
      return new Err(new DustError("unauthorized", res.error.message));
    }

    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        agentConfigurationId: agent.sId,
        triggerName: trigger.name,
        error: res.error,
      },
      "Failed to create trigger"
    );
    return new Err(new DustError("internal_error", res.error.message));
  }

  return res;
}

/**
 * @cc [owner:fabiencelier,label:security] trigger-deletion-scope
 * Among `triggerIds`, MUST only delete the triggers of `agentId` whose editor is the caller, or any
 * trigger of `agentId` when the caller is a workspace admin. Other ids are skipped without failing.
 */
export async function deleteAgentTriggers(
  auth: Authenticator,
  { agentId, triggerIds }: { agentId: string; triggerIds: string[] }
): Promise<Result<undefined, DustError<"internal_error">>> {
  const allTriggers = await TriggerResource.listByAgentConfigurationId(
    auth,
    agentId
  );
  const deletableTriggers = allTriggers.filter(
    (trigger) =>
      triggerIds.includes(trigger.sId) &&
      (auth.isAdmin() || trigger.isEditedBy(auth))
  );

  for (const trigger of deletableTriggers) {
    const res = await trigger.delete(auth);
    if (res.isErr()) {
      logger.error(
        {
          workspaceId: auth.getNonNullableWorkspace().sId,
          agentConfigurationId: agentId,
          triggerId: trigger.sId,
          error: res.error,
        },
        "Failed to delete trigger"
      );
      return new Err(
        new DustError(
          "internal_error",
          `Failed to delete trigger ${trigger.sId}.`
        )
      );
    }
  }

  return new Ok(undefined);
}
