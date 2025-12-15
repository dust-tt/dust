import { Chip } from "@dust-tt/sparkle";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIdToActionsMap } from "@app/components/shared/getSpaceIdToActionsMap";
import { useSkillsContext } from "@app/components/shared/skills/SkillsContext";
import { useMCPServerViewsContext } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";

export function AgentBuilderSpacesBlock() {
  const { watch } = useFormContext<AgentBuilderFormData>();

  const { mcpServerViews } = useMCPServerViewsContext();
  const { skills: allSkills } = useSkillsContext();
  const { spaces } = useSpacesContext();

  const selectedSkills = watch("skills");
  const actions = watch("actions");

  // Compute requested spaces from tools/knowledge (actions)
  const spaceIdToActions = useMemo(() => {
    return getSpaceIdToActionsMap(actions, mcpServerViews);
  }, [actions, mcpServerViews]);

  // Merge requested spaces from skills and from actions
  const nonGlobalSpacesWithRestrictions = useMemo(() => {
    const nonGlobalSpaces = spaces.filter((s) => s.kind !== "global");

    // Get selected skill IDs
    const selectedSkillIds = new Set(selectedSkills.map((s) => s.sId));

    // Collect space IDs from selected skills using the full skill data from context
    const skillRequestedSpaceIds = new Set(
      allSkills
        .filter((skill) => selectedSkillIds.has(skill.sId))
        .flatMap((skill) => skill.requestedSpaceIds)
    );

    // Collect space IDs from actions (tools/knowledge)
    const actionRequestedSpaceIds = new Set<string>();
    for (const spaceId of Object.keys(spaceIdToActions)) {
      if (spaceIdToActions[spaceId]?.length > 0) {
        actionRequestedSpaceIds.add(spaceId);
      }
    }

    // Merge both sets
    const allRequestedSpaceIds = new Set([
      ...skillRequestedSpaceIds,
      ...actionRequestedSpaceIds,
    ]);

    return nonGlobalSpaces.filter((s) => allRequestedSpaceIds.has(s.sId));
  }, [spaces, selectedSkills, allSkills, spaceIdToActions]);

  if (nonGlobalSpacesWithRestrictions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 px-6">
      <div>
        <h2 className="heading-lg text-foreground dark:text-foreground-night">
          Spaces
        </h2>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Determines who can use this agent and what data it can access
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {nonGlobalSpacesWithRestrictions.map((space) => (
          <Chip
            key={space.sId}
            label={getSpaceName(space)}
            icon={getSpaceIcon(space)}
          />
        ))}
      </div>
    </div>
  );
}
