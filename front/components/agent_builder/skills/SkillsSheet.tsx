import type { MultiPageSheetPage } from "@dust-tt/sparkle";
import {
  ActionCard,
  MultiPageSheet,
  MultiPageSheetContent,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SKILL_ICON } from "@app/lib/skill";
import { useSkillConfigurations } from "@app/lib/swr/skill_configurations";
import type { SkillConfigurationWithAuthorType } from "@app/types/skill_configuration";

const SKILLS_SHEET_PAGE_IDS = {
  SELECTION: "skill-selection",
} as const;

interface SkillsSheetProps {
  open: boolean;
  onClose: () => void;
  selectedSkills: AgentBuilderSkillsType[];
  onSave: (skills: AgentBuilderSkillsType[]) => void;
}

interface SkillCardProps {
  skill: SkillConfigurationWithAuthorType;
  isSelected: boolean;
  onClick: () => void;
}

function SkillCard({ skill, isSelected, onClick }: SkillCardProps) {
  return (
    <ActionCard
      icon={SKILL_ICON}
      label={skill.name}
      description={skill.description}
      isSelected={isSelected}
      canAdd={true}
      onClick={onClick}
      cardContainerClassName="h-36"
      mountPortal
    />
  );
}

export function SkillsSheet({
  open,
  onClose,
  selectedSkills,
  onSave,
}: SkillsSheetProps) {
  const { owner } = useAgentBuilderContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelectedSkills, setLocalSelectedSkills] =
    useState<AgentBuilderSkillsType[]>(selectedSkills);

  const { skillConfigurations, isSkillConfigurationsLoading } =
    useSkillConfigurations({
      workspaceId: owner.sId,
      disabled: !open,
    });

  // Reset local state when sheet opens
  useEffect(() => {
    if (open) {
      setLocalSelectedSkills(selectedSkills);
      setSearchQuery("");
    }
  }, [open, selectedSkills]);

  const selectedSkillIds = useMemo(
    () => new Set(localSelectedSkills.map((s) => s.sId)),
    [localSelectedSkills]
  );

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return skillConfigurations;
    }
    const query = searchQuery.toLowerCase();
    return skillConfigurations.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query)
    );
  }, [skillConfigurations, searchQuery]);

  const handleSkillToggle = useCallback(
    (skill: SkillConfigurationWithAuthorType) => {
      setLocalSelectedSkills((prev) => {
        const isAlreadySelected = prev.some((s) => s.sId === skill.sId);
        if (isAlreadySelected) {
          return prev.filter((s) => s.sId !== skill.sId);
        } else {
          return [
            ...prev,
            {
              sId: skill.sId,
              name: skill.name,
              description: skill.description,
            },
          ];
        }
      });
    },
    []
  );

  const handleSave = useCallback(() => {
    onSave(localSelectedSkills);
    onClose();
  }, [localSelectedSkills, onSave, onClose]);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const pages: MultiPageSheetPage[] = [
    {
      id: SKILLS_SHEET_PAGE_IDS.SELECTION,
      title: "Add skills",
      content: (
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
                />
              ))}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <MultiPageSheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <MultiPageSheetContent
        pages={pages}
        currentPageId={SKILLS_SHEET_PAGE_IDS.SELECTION}
        onPageChange={() => {}}
        size="xl"
        addFooterSeparator
        showHeaderNavigation={false}
        showNavigation={false}
        leftButton={{
          label: "Cancel",
          variant: "outline",
          onClick: handleClose,
        }}
        rightButton={{
          label: "Save",
          variant: "primary",
          onClick: handleSave,
        }}
      />
    </MultiPageSheet>
  );
}
