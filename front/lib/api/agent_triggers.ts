import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { GroupResource } from "@app/lib/resources/group_resource";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { AgentsUsageType } from "@app/types/data_source";
import type { ModelId } from "@app/types/shared/model_id";
import { Op } from "sequelize";

// To use in case of heavy db load emergency with these usages queries
// If it is a problem, let's add caching
const DISABLE_QUERIES = false;

export type WebhookSourcesUsage = Record<ModelId, AgentsUsageType>;

async function getAccessibleAgentsInfoBySId({
  auth,
}: {
  auth: Authenticator;
}): Promise<Map<string, { sId: string; name: string }>> {
  const owner = auth.workspace();

  if (!owner || !auth.isUser()) {
    return new Map();
  }

  const getAgentsForUser = async () =>
    (await GroupResource.findAgentIdsForGroups(auth, auth.groupModelIds())).map(
      (g) => g.agentConfigurationId
    );

  const agentWhereClause = auth.isAdmin()
    ? {
        workspaceId: owner.id,
        status: "active" as const,
      }
    : {
        workspaceId: owner.id,
        status: "active" as const,
        [Op.or]: [
          {
            scope: "visible",
          },
          {
            id: {
              [Op.in]: await getAgentsForUser(),
            },
          },
        ],
      };

  const accessibleAgents = await AgentConfigurationModel.findAll({
    attributes: ["id", "sId", "name"],
    where: agentWhereClause,
  });

  return new Map(
    accessibleAgents.map((agent) => [
      agent.sId,
      { sId: agent.sId, name: agent.name },
    ])
  );
}

async function getTriggersWithAgentAccesibleAgent({
  auth,
  agentInfoBySId,
}: {
  auth: Authenticator;
  agentInfoBySId: Map<string, { sId: string; name: string }>;
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
      agentInfoBySId.has(trigger.agentConfigurationId)
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

  const agentInfoBySId = await getAccessibleAgentsInfoBySId({ auth });

  if (agentInfoBySId.size === 0) {
    return {};
  }

  const filteredTriggers = await getTriggersWithAgentAccesibleAgent({
    auth,
    agentInfoBySId,
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

  const usageMap = new Map<ModelId, Map<string, string>>();

  for (const trigger of filteredTriggers) {
    const viewId = Number(trigger.webhookSourceViewId);
    if (!Number.isFinite(viewId)) {
      continue;
    }

    const sourceId = viewToSource.get(viewId);
    if (!sourceId) {
      continue;
    }

    const agentInfo = agentInfoBySId.get(trigger.agentConfigurationId);
    if (!agentInfo) {
      continue;
    }

    let agentsForSource = usageMap.get(sourceId);
    if (!agentsForSource) {
      agentsForSource = new Map<string, string>();
      usageMap.set(sourceId, agentsForSource);
    }

    agentsForSource.set(agentInfo.sId, agentInfo.name);
  }

  const usage: WebhookSourcesUsage = {};

  usageMap.forEach((agentsMap, sourceId) => {
    const agents = Array.from(agentsMap.entries())
      .map(([sId, name]) => ({ sId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    usage[sourceId] = {
      count: agents.length,
      agents,
    };
  });

  return usage;
}
