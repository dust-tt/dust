import { Button, SearchInput, Spinner } from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { MCPServerCard } from "@app/components/agent_builder/capabilities/mcp/MCPServerSelectionPage";
import { SkillCard } from "@app/components/agent_builder/skills/skillSheet/SkillCard";
import type {
  CapabilityFilterType,
  PageContentProps,
  SelectionMode,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import type { WhitelistableFeature } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

type SelectionPageProps = PageContentProps & {
  mode: SelectionMode;
  // Skills props
  handleSkillToggle: (skill: SkillType) => void;
  filteredSkills: SkillType[];
  isSkillsLoading: boolean;
  searchQuery: string;
  selectedSkillIds: Set<string>;
  setSearchQuery: (query: string) => void;
  // Tools props
  topMCPServerViews: MCPServerViewTypeWithLabel[];
  nonTopMCPServerViews: MCPServerViewTypeWithLabel[];
  onToolClick: (mcpServerView: MCPServerViewTypeWithLabel) => void;
  onToolDetailsClick: (view: MCPServerViewTypeWithLabel) => void;
  isMCPServerViewsLoading: boolean;
  featureFlags?: WhitelistableFeature[];
  // Filter props
  filter: CapabilityFilterType;
  onFilterChange: (filter: CapabilityFilterType) => void;
};

export function SelectionPageContent({
  onModeChange,
  mode: _mode,
  handleSkillToggle,
  filteredSkills,
  isSkillsLoading,
  searchQuery,
  selectedSkillIds,
  setSearchQuery,
  topMCPServerViews,
  nonTopMCPServerViews,
  selectedToolsInSheet,
  onToolClick,
  onToolDetailsClick,
  isMCPServerViewsLoading,
  featureFlags,
  filter,
  onFilterChange,
}: SelectionPageProps) {
  const selectedMCPIds = useMemo(() => {
    return new Set(selectedToolsInSheet.map((t) => t.view.sId));
  }, [selectedToolsInSheet]);

  const allTools = useMemo(
    () => [...topMCPServerViews, ...nonTopMCPServerViews],
    [topMCPServerViews, nonTopMCPServerViews]
  );

  const showSkillsSection = filter === "all" || filter === "skills";
  const showToolsSection = filter === "all" || filter === "tools";

  const hasSkills = filteredSkills.length > 0;
  const hasTools = allTools.length > 0;
  const isLoading = isSkillsLoading || isMCPServerViewsLoading;

  const hasAnyResults =
    (showSkillsSection && hasSkills) || (showToolsSection && hasTools);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Button
          label="All"
          variant={filter === "all" ? "primary" : "outline"}
          size="sm"
          onClick={() => onFilterChange("all")}
        />
        <Button
          label="Skills"
          variant={filter === "skills" ? "primary" : "outline"}
          size="sm"
          onClick={() => onFilterChange("skills")}
        />
        <Button
          label="Tools"
          variant={filter === "tools" ? "primary" : "outline"}
          size="sm"
          onClick={() => onFilterChange("tools")}
        />
      </div>

      <SearchInput
        placeholder="Search capabilities..."
        value={searchQuery}
        onChange={setSearchQuery}
        name="capability-search"
      />

      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !hasAnyResults ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="px-4 text-center">
            <div className="mb-2 text-lg font-medium text-foreground dark:text-foreground-night">
              {searchQuery
                ? "No results match your search"
                : "No capabilities available"}
            </div>
            <div className="max-w-sm text-muted-foreground dark:text-muted-foreground-night">
              {searchQuery
                ? "Try a different search term or filter."
                : "Add tools or create skills to enhance your agents."}
            </div>
          </div>
        </div>
      ) : (
        <>
          {showSkillsSection && hasSkills && (
            <>
              <span className="text-lg font-semibold">Skills</span>
              <div className="grid grid-cols-2 gap-3">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.sId}
                    skill={skill}
                    isSelected={selectedSkillIds.has(skill.sId)}
                    onClick={() => handleSkillToggle(skill)}
                    onMoreInfoClick={() => {
                      onModeChange({
                        type: SKILLS_SHEET_PAGE_IDS.SKILL_INFO,
                        skill,
                        source: "skillDetails",
                      });
                    }}
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
        </>
      )}
    </div>
  );
}
