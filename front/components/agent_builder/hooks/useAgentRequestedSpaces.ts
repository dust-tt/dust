import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useSpaceProjectsLookup } from "@app/lib/swr/spaces";
import type { EnrichedSpaceType } from "@app/types/space";
import { useMemo } from "react";
import { useWatch } from "react-hook-form";

interface UseAgentRequestedSpacesProps {
  initialRequestedSpaceIds?: string[];
}

interface UseAgentRequestedSpacesResult {
  actionsAndSkillsRequestedSpaceIds: Set<string>;
  allSpaces: EnrichedSpaceType[];
  globalSpace: EnrichedSpaceType | undefined;
  missingSpaceIds: string[];
  nonGlobalSpacesUsedByAgent: EnrichedSpaceType[];
  nonGlobalSpacesWithRestrictions: EnrichedSpaceType[];
  spaceIdToActions: ReturnType<typeof getSpaceIdToActionsMap>;
}

/**
 * Derives the spaces an agent requires from its selected tools, knowledge,
 * skills and additional spaces. Shared by the spaces block (which lets the user
 * manage them) and the access section (which explains who can use the agent).
 */
export function useAgentRequestedSpaces({
  initialRequestedSpaceIds,
}: UseAgentRequestedSpacesProps): UseAgentRequestedSpacesResult {
  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();
  const { spaces, owner, isSpacesLoading } = useSpacesContext();

  const selectedSkills = useWatch<AgentBuilderFormData, "skills">({
    name: "skills",
  });
  const actions = useWatch<AgentBuilderFormData, "actions">({
    name: "actions",
  });
  const additionalSpaces = useWatch<AgentBuilderFormData, "additionalSpaces">({
    name: "additionalSpaces",
  });

  // The agent might be linked to some open projects that the user is not
  // a member of, so we fetch them here.
  const missingSpaceIds = useMemo(() => {
    if (isSpacesLoading || !initialRequestedSpaceIds?.length) {
      return [];
    }
    const existingSpaceIds = new Set(spaces.map((s) => s.sId));

    return initialRequestedSpaceIds.filter((id) => !existingSpaceIds.has(id));
  }, [isSpacesLoading, initialRequestedSpaceIds, spaces]);

  const { spaces: missingSpaces } = useSpaceProjectsLookup({
    workspaceId: owner.sId,
    spaceIds: missingSpaceIds,
  });

  const allSpaces = useMemo(() => {
    return [...spaces, ...missingSpaces];
  }, [spaces, missingSpaces]);

  // Compute requested spaces from tools/knowledge (actions)
  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  // Merge requested spaces from skills, actions, and additional spaces (from global skills)
  const actionsAndSkillsRequestedSpaceIds = useMemo(() => {
    const selectedSkillIds = new Set(selectedSkills.map((s) => s.sId));
    const skillRequestedSpaceIds = new Set(
      allSkills
        .filter((skill) => selectedSkillIds.has(skill.sId))
        .flatMap((skill) => skill.requestedSpaceIds)
    );

    const actionRequestedSpaceIds = new Set<string>();
    for (const spaceId of Object.keys(spaceIdToActions)) {
      if (spaceIdToActions[spaceId]?.length > 0) {
        actionRequestedSpaceIds.add(spaceId);
      }
    }

    return new Set([...skillRequestedSpaceIds, ...actionRequestedSpaceIds]);
  }, [selectedSkills, allSkills, spaceIdToActions]);

  const nonGlobalSpacesUsedByAgent = useMemo(() => {
    const nonGlobalSpaces = allSpaces.filter((s) => s.kind !== "global");
    const allRequestedSpaceIds = new Set([
      ...actionsAndSkillsRequestedSpaceIds,
      ...additionalSpaces,
    ]);

    return nonGlobalSpaces.filter((s) => allRequestedSpaceIds.has(s.sId));
  }, [allSpaces, actionsAndSkillsRequestedSpaceIds, additionalSpaces]);

  const nonGlobalSpacesWithRestrictions = useMemo(() => {
    return nonGlobalSpacesUsedByAgent.filter((s) => s.isRestricted);
  }, [nonGlobalSpacesUsedByAgent]);

  const globalSpace = useMemo(() => {
    return allSpaces.find((s) => s.kind === "global");
  }, [allSpaces]);

  return {
    actionsAndSkillsRequestedSpaceIds,
    allSpaces,
    globalSpace,
    missingSpaceIds,
    nonGlobalSpacesUsedByAgent,
    nonGlobalSpacesWithRestrictions,
    spaceIdToActions,
  };
}
