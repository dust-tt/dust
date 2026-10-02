import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { listActiveConfigurationIdentities } from "@app/lib/resources/agent_configuration_rows";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import logger from "@app/logger/logger";
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
