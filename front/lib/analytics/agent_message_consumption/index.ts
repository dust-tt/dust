import type { ConsumptionDocumentsSkipReason } from "@app/lib/analytics/agent_message_consumption/documents";
import { buildAgentMessageConsumptionAnalyticsDocuments } from "@app/lib/analytics/agent_message_consumption/documents";
import {
  loadConsumptionAnalyticsInput,
  loadLegacySettledConsumptionAnalyticsInput,
} from "@app/lib/analytics/agent_message_consumption/load";
import {
  upsertAgentMessageConsumptionAnalyticsDocuments,
  upsertVersionedShadowAgentMessageConsumptionAnalyticsDocuments,
} from "@app/lib/analytics/agent_message_consumption/store";
import type { ElasticsearchError } from "@app/lib/api/elasticsearch";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
): Promise<Result<void, ElasticsearchError | ConsumptionDocumentsSkipReason>> {
  const input = await loadLegacySettledConsumptionAnalyticsInput(auth, {
    agentMessageId,
    preloadedActions,
  });
  if (!input) {
    return new Ok(undefined);
  }

  const documentsResult = buildAgentMessageConsumptionAnalyticsDocuments(input);
  if (documentsResult.isErr()) {
    return documentsResult;
  }
  if (documentsResult.value.length === 0) {
    return new Err({ code: "empty_documents", context: {} });
  }

  return upsertAgentMessageConsumptionAnalyticsDocuments(documentsResult.value);
}

/**
 * @cc [owner:id13,label:backend;data-integrity] complete-consumption-snapshot
 * The snapshot MUST NOT be indexed when document projection fails or produces no documents. The
 * failure MUST be returned to the caller.
 */
export async function indexAgentMessageConsumptionSnapshot(
  auth: Authenticator,
  {
    agentMessageModelId,
    eventModelId,
  }: {
    agentMessageModelId: ModelId;
    eventModelId: ModelId;
  }
): Promise<
  Result<
    { versionConflictCount: number },
    ElasticsearchError | ConsumptionDocumentsSkipReason
  >
> {
  const input = await loadConsumptionAnalyticsInput(auth, {
    agentMessageModelId,
  });
  if (!input) {
    return new Ok({ versionConflictCount: 0 });
  }

  const documentsResult = buildAgentMessageConsumptionAnalyticsDocuments(input);
  if (documentsResult.isErr()) {
    return documentsResult;
  }
  if (documentsResult.value.length === 0) {
    return new Err({ code: "empty_documents", context: {} });
  }

  const versionedDocuments = documentsResult.value.map((document) => ({
    document,
    version: eventModelId,
  }));
  return upsertVersionedShadowAgentMessageConsumptionAnalyticsDocuments(
    versionedDocuments
  );
}
