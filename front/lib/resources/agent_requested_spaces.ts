import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { invalidateAgentResourceCaches } from "@app/lib/resources/agent_resource_cache";
import { launchAgentSearchIndexation } from "@app/lib/resources/agent_resource_indexation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

// Leaf module (imports only `AgentConfigurationModel` and the agent cache/indexation leaves, never
// `AgentResource`) so callers below `AgentResource` in the module graph — `SkillResource`, which
// `AgentResource` itself depends on — can import it without forming a cycle. `AgentResource` exposes
// it as `AgentResource.updateRequestedSpaceIdsInPlace` for callers that can import the class.

/**
 * @cc [owner:tdraier,label:backend;performance] requested-spaces-cascade-through-agent-domain
 * A system cascade that recomputes an agent's `requestedSpaceIds` because a capability's space
 * requirements changed (a skill archived/restored, a space soft-deleted) MUST go through this
 * function (or its `AgentResource.updateRequestedSpaceIdsInPlace` facade), so the configuration
 * write, the cache invalidation and the search reindex stay owned by the agent domain and cannot
 * drift apart. Runtime callers MUST NOT write `requestedSpaceIds` on `AgentConfigurationModel`
 * directly (one-off maintenance scripts excepted). The change is applied in place to the given
 * configuration version — no new version — and is NOT gated on the agent's `write`/`admin` verbs: it
 * is a derived-state recomputation, not a user edit, so it may run on agents the acting caller does
 * not edit.
 */
export async function updateAgentRequestedSpaceIdsInPlace(
  auth: Authenticator,
  {
    agentConfigurationModelId,
    newSpaceIds,
  }: { agentConfigurationModelId: ModelId; newSpaceIds: ModelId[] },
  { transaction }: { transaction?: Transaction } = {}
): Promise<Result<boolean, Error>> {
  const owner = auth.getNonNullableWorkspace();

  // `returning` yields the updated row's `sId` so its cached AgentResource can be invalidated
  // without a second query (`requestedSpaceIds` is a snapshot field).
  const [updatedCount, updatedConfigurations] =
    await AgentConfigurationModel.update(
      { requestedSpaceIds: newSpaceIds },
      {
        where: {
          workspaceId: owner.id,
          id: agentConfigurationModelId,
        },
        returning: ["sId"],
        transaction,
      }
    );

  const updatedAgentIds = updatedConfigurations.map(
    (configuration) => configuration.sId
  );

  await invalidateAgentResourceCaches(owner.id, updatedAgentIds, transaction);

  // `requestedSpaceIds` is indexed, so the search documents of the updated agents are now stale.
  await launchAgentSearchIndexation(owner.sId, updatedAgentIds, transaction);

  return new Ok(updatedCount > 0);
}
