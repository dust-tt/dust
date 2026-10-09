import { MAX_RENDERED_CAPABILITY_ITEMS } from "@app/components/editor/extensions/shared/SlashCommandCapabilitiesItems";
import {
  getMcpServerViewDisplayName,
  isToolWithKnowledge,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { CAPABILITIES_SWR_OPTIONS } from "@app/lib/swr/capabilities";
import {
  useJITMCPServerViewsFromSpaces,
  useMCPServerViewsFromMemberSpaces,
} from "@app/lib/swr/mcp_servers";
import { useSearchSkills } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

import { buildCapabilitySlashCommandItems } from "./buildSlashCommandItems";

function getSkillBuilderSlashCommandTools({
  serverViews,
  spaces,
}: {
  serverViews: MCPServerViewType[];
  spaces: { sId: string; name: string }[];
}): MCPServerViewType[] {
  const serverIdToCount = serverViews.reduce(
    (acc, view) => {
      acc[view.server.sId] = (acc[view.server.sId] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return serverViews
    .filter((view) => !isToolWithKnowledge(view))
    .filter((view) => getMCPServerRequirements(view).noRequirement)
    .map((view) => {
      const displayName = getMcpServerViewDisplayName(view);

      if (serverIdToCount[view.server.sId] > 1) {
        const spaceName = spaces.find(
          (space) => space.sId === view.spaceId
        )?.name;

        if (spaceName) {
          return {
            ...view,
            label: `${displayName} (${spaceName})`,
          };
        }
      }

      return {
        ...view,
        label: displayName,
      };
    });
}

export function useInputBarSlashCommandCapabilities({
  disabled = false,
  excludeSkillId,
  owner,
  query,
}: {
  // When true nothing is fetched and no capability is returned (a menu without capabilities).
  disabled?: boolean;
  excludeSkillId?: string | null;
  owner: LightWorkspaceType;
  query: string;
}) {
  const { spaces: globalSpaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    disabled,
    swrOptions: CAPABILITIES_SWR_OPTIONS,
  });
  const { skills, resolvedSearchTerm, isSkillsError, isSkillsLoading } =
    useSearchSkills({
      owner,
      searchTerm: query,
      selectionMode: "favorites_or_all",
      excludeSkillId,
      limit: MAX_RENDERED_CAPABILITY_ITEMS,
      disabled,
    });
  // Use the displayed skills' query so tools and skills update together.
  const capabilityQuery = resolvedSearchTerm ?? "";
  // Hold tools back until skills have loaded once, so skills are not pushed in above them.
  const hasSkillsSettled = resolvedSearchTerm !== null || isSkillsError;
  // The JIT views endpoint only returns views whose tools can be enabled directly in a
  // conversation, no further filtering needed here.
  const { serverViews, isLoading: isServerViewsLoading } =
    useJITMCPServerViewsFromSpaces(owner, globalSpaces, {
      ...CAPABILITIES_SWR_OPTIONS,
      disabled,
    });

  const capabilityItems = useMemo(
    () =>
      disabled
        ? []
        : buildCapabilitySlashCommandItems({
            excludeSkillId,
            query: capabilityQuery,
            useSearchRanking: true,
            skills,
            tools: hasSkillsSettled ? serverViews : [],
          }),
    [
      capabilityQuery,
      disabled,
      excludeSkillId,
      hasSkillsSettled,
      serverViews,
      skills,
    ]
  );

  return {
    capabilityItems,
    resolvedQuery: capabilityQuery,
    // Every workspace has at least one global skill and one tool, so stop loading
    // as soon as a matching capability is shown (tools only show once skills have loaded).
    isLoading:
      !disabled &&
      capabilityItems.length === 0 &&
      (isSkillsLoading || isSpacesLoading || isServerViewsLoading),
  };
}

export function useSkillBuilderSlashCommandCapabilities({
  excludeSkillId,
  owner,
  query,
}: {
  excludeSkillId?: string | null;
  owner: LightWorkspaceType;
  query: string;
}) {
  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: "all",
  });
  const { skills, resolvedSearchTerm, isSkillsLoading } = useSearchSkills({
    owner,
    searchTerm: query,
    selectionMode: "favorites_or_all",
    excludeSkillId,
    limit: MAX_RENDERED_CAPABILITY_ITEMS,
  });
  // Use the displayed skills' query so tools and skills update together.
  const capabilityQuery = resolvedSearchTerm ?? "";
  const { serverViews, isLoading: isServerViewsLoading } =
    useMCPServerViewsFromMemberSpaces(owner, {
      includeRestrictedToSkills: true,
    });

  const tools = useMemo(
    () => getSkillBuilderSlashCommandTools({ serverViews, spaces }),
    [serverViews, spaces]
  );

  const capabilityItems = useMemo(
    () =>
      buildCapabilitySlashCommandItems({
        excludeSkillId,
        query: capabilityQuery,
        skills,
        tools,
        useSearchRanking: true,
        toolFilter: (serverView) =>
          getMCPServerRequirements(serverView).noRequirement,
      }),
    [capabilityQuery, excludeSkillId, skills, tools]
  );

  return {
    capabilityItems,
    resolvedQuery: capabilityQuery,
    // Spaces are needed to label tools available in several spaces.
    isLoading: isSkillsLoading || isSpacesLoading || isServerViewsLoading,
  };
}
