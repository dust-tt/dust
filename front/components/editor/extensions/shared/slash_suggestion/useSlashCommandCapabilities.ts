import {
  getMcpServerViewDisplayName,
  isToolWithKnowledge,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { CAPABILITIES_SWR_OPTIONS } from "@app/lib/swr/capabilities";
import {
  useJITMCPServerViewsFromSpaces,
  useMCPServerViewsFromSpaces,
} from "@app/lib/swr/mcp_servers";
import { useSearchSkills, useSkills } from "@app/lib/swr/skill_configurations";
import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType } from "@app/types/user";
import type { RefObject } from "react";
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
  excludeSkillId,
  owner,
  query,
  selectedMCPServerViewIdsRef,
}: {
  excludeSkillId?: string | null;
  owner: LightWorkspaceType;
  query: string;
  selectedMCPServerViewIdsRef?: RefObject<Set<string>>;
}) {
  const { spaces: globalSpaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
    swrOptions: CAPABILITIES_SWR_OPTIONS,
  });
  const { skills, isSkillsLoading } = useSearchSkills({
    owner,
    searchTerm: query,
    swrOptions: CAPABILITIES_SWR_OPTIONS,
  });
  // The JIT views endpoint only returns views whose tools can be enabled directly in a
  // conversation, no further filtering needed here.
  const { serverViews, isLoading: isServerViewsLoading } =
    useJITMCPServerViewsFromSpaces(
      owner,
      globalSpaces,
      CAPABILITIES_SWR_OPTIONS
    );

  const capabilityItems = useMemo(
    () =>
      buildCapabilitySlashCommandItems({
        excludeSkillId,
        query,
        skills,
        tools: serverViews,
        toolFilter: (serverView) =>
          !(selectedMCPServerViewIdsRef?.current ?? new Set()).has(
            serverView.sId
          ),
      }),
    [excludeSkillId, query, selectedMCPServerViewIdsRef, serverViews, skills]
  );

  return {
    capabilityItems,
    // Every workspace has at least one global skill and one tool, so stop loading
    // as soon as either source returns a matching capability.
    isLoading:
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
  const { skills, isSkillsLoading } = useSkills({
    owner,
    status: "active",
  });
  const { serverViews, isLoading: isServerViewsLoading } =
    useMCPServerViewsFromSpaces(owner, spaces, {
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
        query,
        skills,
        tools,
        toolFilter: (serverView) =>
          getMCPServerRequirements(serverView).noRequirement,
      }),
    [excludeSkillId, query, skills, tools]
  );

  return {
    capabilityItems,
    isLoading: isSkillsLoading || isSpacesLoading || isServerViewsLoading,
  };
}
