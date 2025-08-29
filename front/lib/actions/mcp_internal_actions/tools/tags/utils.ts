import type { CoreSearchArgs } from "@app/lib/actions/mcp_internal_actions/tools/utils";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import {
  isLightServerSideMCPToolConfiguration,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";

function hasTagAutoMode(dataSourceConfigurations: DataSourceConfiguration[]) {
  return dataSourceConfigurations.some(
    (dataSourceConfiguration) =>
      dataSourceConfiguration.filter.tags?.mode === "auto"
  );
}

export function shouldAutoGenerateTags(
  agentLoopContext: AgentLoopContextType
): boolean {
  const { listToolsContext, runContext } = agentLoopContext;
  if (
    !!listToolsContext?.agentActionConfiguration &&
    isServerSideMCPServerConfiguration(
      listToolsContext.agentActionConfiguration
    ) &&
    !!listToolsContext.agentActionConfiguration.dataSources
  ) {
    return hasTagAutoMode(
      listToolsContext.agentActionConfiguration.dataSources
    );
  } else if (
    !!runContext?.toolConfiguration &&
    isLightServerSideMCPToolConfiguration(runContext.toolConfiguration) &&
    !!runContext.toolConfiguration.dataSources
  ) {
    return hasTagAutoMode(runContext.toolConfiguration.dataSources);
  }

  return false;
}

/**
 * Checks for conflicting tags across core search arguments and returns an error message if any.
 * If a tag is both included and excluded, we will not get any result.
 */
export function checkConflictingTags(
  coreSearchArgs: CoreSearchArgs[],
  { tagsIn, tagsNot }: { tagsIn?: string[]; tagsNot?: string[] }
): string | null {
  for (const args of coreSearchArgs) {
    const configTagsIn = args.filter.tags?.in ?? [];
    const configTagsNot = args.filter.tags?.not ?? [];

    const finalTagsIn = [...configTagsIn, ...(tagsIn ?? [])];
    const finalTagsNot = [...configTagsNot, ...(tagsNot ?? [])];

    const conflictingTags = finalTagsIn.filter((tag) =>
      finalTagsNot.includes(tag)
    );
    if (conflictingTags.length > 0) {
      const conflictingTagsList = conflictingTags.join(", ");
      const tagsInList =
        configTagsIn.length > 0 ? configTagsIn.join(", ") : "none";
      const tagsNotList =
        configTagsNot.length > 0 ? configTagsNot.join(", ") : "none";

      // We actually return even if we get one conflict.
      // We can have a conflict only if the agent created one by passing some tags without being
      // aware that it would create a conflict with a configured tag.
      // The rationale behind it is that there is a low overlap between the tags across data
      // sources. Therefore, even if we did have some content in another data source, it is
      // probably not what the agent intended and its filtering had no use.
      return (
        "No results were found due to conflicting tags. The following tags appear in both " +
        `include and exclude lists: ${conflictingTagsList}.\n\nTags that are already included: ` +
        `${tagsInList}\n Tags that are already excluded ${tagsNotList}\n\nPlease adjust your ` +
        "tag filters to avoid conflicts."
      );
    }
  }

  return null;
}
