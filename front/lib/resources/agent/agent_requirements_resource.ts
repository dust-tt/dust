import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentSearchIndexationResource } from "@app/lib/resources/agent/agent_search_indexation_resource";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import type { Transaction } from "sequelize";

// A dependency-light writer: skills propagate space requirements to agents, so it must not
// depend on AgentResource, whose creation and hydration paths themselves load skills.
export class AgentRequirementsResource {
  static async update(
    auth: Authenticator,
    {
      agentModelId,
      newSpaceIds,
    }: { agentModelId: ModelId; newSpaceIds: ModelId[] },
    { transaction }: { transaction?: Transaction } = {}
  ): Promise<Result<boolean, Error>> {
    const workspace = auth.getNonNullableWorkspace();
    const [affectedCount, agents] = await AgentConfigurationModel.update(
      { requestedSpaceIds: newSpaceIds },
      {
        where: { workspaceId: workspace.id, id: agentModelId },
        returning: ["sId"],
        transaction,
      }
    );
    if (affectedCount > 0) {
      await AgentSearchIndexationResource.launch(
        {
          workspaceId: workspace.sId,
          agentIds: agents.map((agent) => agent.sId),
        },
        { transaction }
      );
    }
    return new Ok(affectedCount > 0);
  }
}
