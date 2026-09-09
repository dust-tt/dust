import type { UnsavedMCPServerConfigurationType } from "@app/lib/actions/types/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentActionConfigurationResource } from "@app/lib/resources/agent/agent_action_configuration_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { ModelId } from "@app/types/shared/model_id";

export function getDataSourceViewIdsFromActions(
  actions: UnsavedMCPServerConfigurationType[]
): string[] {
  return AgentActionConfigurationResource.getDataSourceViewIds(actions);
}

export async function getAgentConfigurationRequirementsFromCapabilities(
  auth: Authenticator,
  {
    actions,
    skills,
    ignoreSpaces,
  }: {
    actions: UnsavedMCPServerConfigurationType[];
    skills: SkillResource[];
    ignoreSpaces?: SpaceResource[];
  }
): Promise<{ requestedSpaceIds: ModelId[] }> {
  const [requirements] =
    await AgentActionConfigurationResource.getSpaceRequirements(
      auth,
      [{ actions, skills }],
      { ignoreSpaces }
    );
  return requirements;
}

export async function getContentFragmentsSpaceIds(
  auth: Authenticator,
  nodeDataSourceViewIds: string[]
): Promise<string[]> {
  const dsViews = await DataSourceViewResource.fetchByIds(
    auth,
    nodeDataSourceViewIds
  );
  if (!dsViews || dsViews.length === 0) {
    throw new Error(`Unexpected dataSourceView not found`);
  }

  return dsViews.map((dsView) =>
    SpaceResource.modelIdToSId({
      id: dsView.space.id,
      workspaceId: auth.getNonNullableWorkspace().id,
    })
  );
}
