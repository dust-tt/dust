import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { invalidateAgentResourceCaches } from "@app/lib/resources/agent_resource_cache";
import { launchAgentSearchIndexation } from "@app/lib/resources/agent_resource_indexation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

export async function updateAgentRequirements(
  auth: Authenticator,
  {
    agentModelId,
    newSpaceIds,
  }: { agentModelId: ModelId; newSpaceIds: ModelId[] },
  { transaction }: { transaction?: Transaction }
): Promise<Result<boolean, Error>> {
  const owner = auth.getNonNullableWorkspace();

  // `returning` yields the updated row's `sId` to invalidate its cached AgentResource without a
  // second query (`requestedSpaceIds` is a snapshot field).
  const [updatedCount, updatedConfigurations] =
    await AgentConfigurationModel.update(
      {
        requestedSpaceIds: newSpaceIds,
      },
      {
        where: {
          workspaceId: owner.id,
          id: agentModelId,
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
