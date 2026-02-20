import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
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

  const updated = await AgentConfigurationModel.update(
    {
      requestedSpaceIds: newSpaceIds,
    },
    {
      where: {
        workspaceId: owner.id,
        id: agentModelId,
      },
      transaction,
    }
  );

  return new Ok(updated[0] > 0);
}
