import { ButtonGroup, ToolsIcon } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { MCPServerCard } from "@app/components/agent_builder/capabilities/mcp/MCPServerSelectionPage";
import type {
  SelectedTool,
  SkillSelection,
} from "@app/components/agent_builder/capabilities/mcp/MCPServerViewsSheet";
import { SkillCard } from "@app/components/agent_builder/skills/skillSheet/SkillCard";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { SKILL_ICON } from "@app/lib/skill";
import type { WhitelistableFeature } from "@app/types";

export type CapabilityFilterType = "all" | "tools" | "skills";

interface CapabilitiesSelectionPageProps {
  filter: CapabilityFilterType;
  onFilterChange: (filter: CapabilityFilterType) => void;
  showSkills: boolean;

  // Tools
  topMCPServerViews: MCPServerViewTypeWithLabel[];
  nonTopMCPServerViews: MCPServerViewTypeWithLabel[];
  selectedToolsInSheet: SelectedTool[];
  onToolClick: (mcpServerView: MCPServerViewTypeWithLabel) => void;
  onToolDetailsClick: (view: MCPServerViewTypeWithLabel) => void;

  // Skills
  skills: SkillSelection[];
  selectedSkillsInSheet: SkillSelection[];
  onSkillClick: (skill: SkillSelection) => void;
  onSkillDetailsClick: (skill: SkillSelection) => void;

  featureFlags?: WhitelistableFeature[];
}

export function CapabilitiesSelectionPage({
  filter,
  onFilterChange,
  showSkills,
  topMCPServerViews,
  nonTopMCPServerViews,
  selectedToolsInSheet,
  onToolClick,
  onToolDetailsClick,
  skills,
  selectedSkillsInSheet,
  onSkillClick,
  onSkillDetailsClick,
  featureFlags,
}: CapabilitiesSelectionPageProps) {
  const selectedSkillIds = useMemo(() => {
    return new Set(selectedSkillsInSheet.map((s) => s.sId));
  }, [selectedSkillsInSheet]);

  const selectedMCPIds = useMemo(() => {
    return new Set(selectedToolsInSheet.map((t) => t.view.sId));
  }, [selectedToolsInSheet]);

  const allTools = useMemo(
    () => [...topMCPServerViews, ...nonTopMCPServerViews],
    [topMCPServerViews, nonTopMCPServerViews]
  );

  const showSkillsSection =
    showSkills && (filter === "all" || filter === "skills");
  const showToolsSection = filter === "all" || filter === "tools";

  const hasSkills = skills.length > 0;
  const hasTools = allTools.length > 0;
  const hasAnyResults =
    (showSkillsSection && hasSkills) || (showToolsSection && hasTools);

  return (
    <div className="flex flex-col gap-4 py-2">
      {showSkills && (
        <ButtonGroup
          variant="outline"
          items={[
            {
              type: "button",
              props: {
                label: "All",
                variant: filter === "all" ? "primary" : "ghost-secondary",
                size: "sm",
                onClick: () => onFilterChange("all"),
              },
            },
            {
              type: "button",
              props: {
                label: "Tools",
                variant: filter === "tools" ? "primary" : "ghost-secondary",
                size: "sm",
                onClick: () => onFilterChange("tools"),
                icon: ToolsIcon,
              },
            },
            {
              type: "button",
              props: {
                label: "Skills",
                variant: filter === "skills" ? "primary" : "ghost-secondary",
                size: "sm",
                onClick: () => onFilterChange("skills"),
                icon: SKILL_ICON,
              },
            },
          ]}
        />
      )}

      {!hasAnyResults && (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="px-4 text-center">
            <div className="mb-2 text-lg font-medium text-foreground dark:text-foreground-night">
              No results match your search
            </div>
            <div className="max-w-sm text-muted-foreground dark:text-muted-foreground-night">
              Try a different search term or filter.
            </div>
          </div>
        </div>
      )}

      {showSkillsSection && hasSkills && (
        <>
          <span className="text-lg font-semibold">Skills</span>
          <div className="grid grid-cols-2 gap-3">
            {skills.map((skill) => (
              <SkillCard
                key={skill.sId}
                skill={skill}
                isSelected={selectedSkillIds.has(skill.sId)}
                onClick={() => onSkillClick(skill)}
                onMoreInfoClick={() => onSkillDetailsClick(skill)}
              />
            ))}
          </div>
        </>
      )}

      {showToolsSection && hasTools && (
        <>
          <span className="text-lg font-semibold">Tools</span>
          <div className="grid grid-cols-2 gap-3">
            {allTools.map((view) => (
              <MCPServerCard
                key={view.id}
                view={view}
                isSelected={selectedMCPIds.has(view.sId)}
                onClick={() => onToolClick(view)}
                onToolInfoClick={() => onToolDetailsClick(view)}
                featureFlags={featureFlags}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
