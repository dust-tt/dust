import { buildServerSideMCPServerConfiguration } from "@app/lib/actions/configuration/helpers";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { LightAgentConfigurationType } from "@app/types";
import { removeNulls } from "@app/types";

export async function getSkillServers(
  auth: Authenticator,
  {
    agentConfiguration,
    skills,
  }: {
    agentConfiguration: LightAgentConfigurationType;
    skills: SkillResource[];
  }
): Promise<MCPServerConfigurationType[]> {
  const rawInheritedDataSourceViews = await concurrentExecutor(
    skills,
    (skill) => skill.listInheritedDataSourceViews(auth, agentConfiguration),
    { concurrency: 5 }
  );
  const inheritedDataSourceViews = removeNulls(
    rawInheritedDataSourceViews.flat()
  );
  const dataSources: DataSourceConfiguration[] = inheritedDataSourceViews.map(
    (view) => ({
      dataSourceViewId: view.sId,
      workspaceId: auth.getNonNullableWorkspace().sId,
      filter: view.toViewFilter(),
    })
  );

  return skills.flatMap((skill) =>
    skill.mcpServerViews.map((mcpServerView) => {
      return buildServerSideMCPServerConfiguration({
        mcpServerView,
        dataSources,
      });
    })
  );
}
