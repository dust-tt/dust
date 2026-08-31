import { buildAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/documents";
import { loadAgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import {
  upsertAgentMessageConsumptionAnalyticsDocuments,
  upsertVersionedAgentMessageConsumptionAnalyticsDocuments,
} from "@app/lib/analytics/agent_message_consumption/store";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import assert from "assert";

/**
 * Loads, projects, and indexes the complete consumption analytics snapshot for one agent message.
 * The attribution activity may reuse its already-loaded action snapshot; this module still owns
 * the ordering, projection, and completeness requirements of the indexed snapshot.
 */
export async function indexAgentMessageConsumptionAnalytics(
  auth: Authenticator,
  {
    agentMessageId,
    preloadedActions,
  }: {
    agentMessageId: string;
    preloadedActions?: AgentMCPActionResource[];
  }
): Promise<Result<void, ElasticsearchError>> {
  const input = await loadAgentMessageConsumptionAnalyticsInput(auth, {
    agentMessageId,
    preloadedActions,
  });
  if (!input) {
    return new Ok(undefined);
  }

  const documents = buildAgentMessageConsumptionAnalyticsDocuments(input);
  assert(
    documents && documents.length > 0,
    "Consumption attribution is incomplete for analytics"
  );

  return upsertAgentMessageConsumptionAnalyticsDocuments(documents);
}

export async function indexAgentMessageConsumptionSnapshot(
  auth: Authenticator,
  {
    agentMessageModelId,
    eventModelId,
  }: {
    agentMessageModelId: ModelId;
    eventModelId: ModelId;
  }
): Promise<Result<{ versionConflictCount: number }, ElasticsearchError>> {
  const input = await loadAgentMessageConsumptionAnalyticsInput(auth, {
    agentMessageModelId,
    source: "consumption",
  });
  if (!input) {
    return new Ok({ versionConflictCount: 0 });
  }

  const documents = buildAgentMessageConsumptionAnalyticsDocuments(input);
  assert(
    documents && documents.length > 0,
    "Consumption snapshot is incomplete for analytics"
  );

  const versionedDocuments = documents.map((document) => ({
    document,
    version: eventModelId,
  }));
  return upsertVersionedAgentMessageConsumptionAnalyticsDocuments(
    versionedDocuments
  );
}
