import { Button, SearchInput, Spinner } from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { SkillCard } from "@app/components/agent_builder/capabilities/capabilities_sheet/SkillCard";
import type { CapabilityFilterType } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { MCPServerCard } from "@app/components/agent_builder/capabilities/mcp/MCPServerSelectionPage";
import type { SheetState } from "@app/components/agent_builder/skills/types";
import type { MCPServerViewTypeWithLabel } from "@app/components/shared/tools_picker/MCPServerViewsContext";
import { useSkillWithRelations } from "@app/lib/swr/skill_configurations";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SkillType } from "@app/types/assistant/skill_configuration";

type CapabilitiesSelectionPageProps = {
  onStateChange: (state: SheetState) => void;
  handleSkillToggle: (skill: SkillType) => void;
  filteredSkills: SkillType[];
  searchQuery: string;
  selectedSkillIds: Set<string>;
  setSearchQuery: (query: string) => void;
  isCapabilitiesLoading: boolean;
  filteredMCPServerViews: {
    topViews: MCPServerViewTypeWithLabel[];
    nonTopViews: MCPServerViewTypeWithLabel[];
  };
  selectedMCPServerViewIds: Set<string>;
  handleToolToggle: (view: MCPServerViewTypeWithLabel) => void;
  handleToolInfoClick: (view: MCPServerViewTypeWithLabel) => void;
};

export function CapabilitiesSelectionPageContent({
  handleSkillToggle,
  filteredSkills,
  searchQuery,
  selectedSkillIds,
  setSearchQuery,
  isCapabilitiesLoading,
  filteredMCPServerViews,
  selectedMCPServerViewIds,
  handleToolToggle,
  handleToolInfoClick,
  onStateChange,
}: CapabilitiesSelectionPageProps) {
  const { owner } = useAgentBuilderContext();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });
  const [filter, setFilter] = useState<CapabilityFilterType>("all");

  const { fetchSkillWithRelations } = useSkillWithRelations(owner, {
    onSuccess: ({ skill }) => {
      onStateChange({
        state: "info",
        kind: "skill",
        capability: skill,
        hasPreviousPage: true,
      });
    },
  });

  const sortedMCPServerViews = useMemo(
    () => [
      // Show top views first
      ...filteredMCPServerViews.topViews,
      ...filteredMCPServerViews.nonTopViews,
    ],
    [filteredMCPServerViews.topViews, filteredMCPServerViews.nonTopViews]
  );

  const showSkillsSection = filter === "all" || filter === "skills";
  const showToolsSection = filter === "all" || filter === "tools";

  const hasSkills = filteredSkills.length > 0;
  const hasTools = sortedMCPServerViews.length > 0;

  const hasAnyResults =
    (showSkillsSection && hasSkills) || (showToolsSection && hasTools);

  return (
    <div className="flex flex-col gap-4 pt-1">
      <SearchInput
        placeholder="Search capabilities..."
        value={searchQuery}
        onChange={setSearchQuery}
        name="capability-search"
      />

      <div className="flex gap-2">
        <Button
          label="All"
          variant={filter === "all" ? "primary" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        />
        <Button
          label="Skills"
          variant={filter === "skills" ? "primary" : "outline"}
          size="sm"
          onClick={() => setFilter("skills")}
        />
        <Button
          label="Tools"
          variant={filter === "tools" ? "primary" : "outline"}
          size="sm"
          onClick={() => setFilter("tools")}
        />
      </div>

      {isCapabilitiesLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : !hasAnyResults ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="px-4 text-center">
            <div className="mb-2 text-lg font-medium text-foreground dark:text-foreground-night">
              {searchQuery
                ? "No capability match your search"
                : "No capabilities available"}
            </div>
            <div className="max-w-sm text-muted-foreground dark:text-muted-foreground-night">
              {searchQuery
                ? "Try a different search term."
                : "Add tools or create skills to enhance your agents."}
            </div>
          </div>
        </div>
      ) : (
        <>
          {showSkillsSection && hasSkills && (
            <>
              <div>
                <span className="text-lg font-semibold">Skills</span>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Reusable packages of instructions, tools and knowledge that
                  agents can share.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.sId}
                    skill={skill}
                    isSelected={selectedSkillIds.has(skill.sId)}
                    onClick={() => handleSkillToggle(skill)}
                    onMoreInfoClick={() => fetchSkillWithRelations(skill.sId)}
                  />
                ))}
              </div>
            </>
          )}

          {showToolsSection && hasTools && (
            <>
              <div>
                <span className="text-lg font-semibold">Tools</span>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Capabilities that allow agents to take actions.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {sortedMCPServerViews.map((view) => (
                  <MCPServerCard
                    key={view.id}
                    view={view}
                    isSelected={selectedMCPServerViewIds.has(view.sId)}
                    onClick={() => handleToolToggle(view)}
                    onToolInfoClick={() => handleToolInfoClick(view)}
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
