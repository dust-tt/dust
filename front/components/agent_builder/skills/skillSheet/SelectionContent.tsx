import { SearchInput, Spinner } from "@dust-tt/sparkle";
import React from "react";

import { SkillCard } from "@app/components/agent_builder/skills/skillSheet/SkillCard";
import type {
  PageContentProps,
  SkillsSheetMode,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";

export function SelectionPageContent({
  searchQuery,
  setSearchQuery,
  isSkillConfigurationsLoading,
  filteredSkills,
  selectedSkillIds,
  handleSkillToggle,
  onModeChange,
}: PageContentProps & {
  mode: Extract<
    SkillsSheetMode,
    { type: typeof SKILLS_SHEET_PAGE_IDS.SELECTION }
  >;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SearchInput
        placeholder="Search skills..."
        value={searchQuery}
        onChange={setSearchQuery}
        name="skill-search"
      />

      {isSkillConfigurationsLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="px-4 text-center">
            <div className="mb-2 text-lg font-medium text-foreground dark:text-foreground-night">
              {searchQuery
                ? "No skills match your search"
                : "No skills available"}
            </div>
            <div className="max-w-sm text-muted-foreground dark:text-muted-foreground-night">
              {searchQuery
                ? "Try a different search term."
                : "Create a skill to add custom capabilities to your agents."}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filteredSkills.map((skill) => (
            <SkillCard
              key={skill.sId}
              skill={skill}
              isSelected={selectedSkillIds.has(skill.sId)}
              onClick={() => handleSkillToggle(skill)}
              onMoreInfoClick={() => {
                onModeChange({
                  type: SKILLS_SHEET_PAGE_IDS.INFO,
                  skillConfiguration: skill,
                  source: "addedTool",
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
