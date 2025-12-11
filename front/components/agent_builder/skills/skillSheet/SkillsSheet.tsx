import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SkillsSheetMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { getPageAndFooter } from "@app/components/agent_builder/skills/skillSheet/utils";
import { useSkillConfigurations } from "@app/lib/swr/skill_configurations";
import type { SkillConfigurationType } from "@app/types/assistant/skill_configuration";

interface SkillsSheetProps {
  mode: SkillsSheetMode;
  onClose: () => void;
  selectedSkills: AgentBuilderSkillsType[];
  onSave: (skills: AgentBuilderSkillsType[]) => void;
  onModeChange: (mode: SkillsSheetMode | null) => void;
}

export function SkillsSheet({
  mode,
  onClose,
  selectedSkills,
  onSave,
  onModeChange,
}: SkillsSheetProps) {
  const { owner } = useAgentBuilderContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelectedSkills, setLocalSelectedSkills] =
    useState<AgentBuilderSkillsType[]>(selectedSkills);

  const { skillConfigurations, isSkillConfigurationsLoading } =
    useSkillConfigurations({
      owner,
      disabled: !open,
    });

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

  const handleSkillToggle = useCallback((skill: SkillConfigurationType) => {
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
  }, []);

  const handleSave = useCallback(() => {
    onSave(localSelectedSkills);
    onClose();
  }, [localSelectedSkills, onSave, onClose]);

  const { page, leftButton, rightButton } = getPageAndFooter({
    mode,
    searchQuery,
    setSearchQuery,
    isSkillConfigurationsLoading,
    filteredSkills,
    selectedSkillIds,
    handleSkillToggle,
    onModeChange,
    onClose,
    handleSave,
  });

  return (
    <MultiPageSheet open onOpenChange={(open) => !open && onClose()}>
      <MultiPageSheetContent
        pages={[page]}
        currentPageId={mode.type}
        onPageChange={() => {}}
        size="xl"
        addFooterSeparator
        showHeaderNavigation={false}
        showNavigation={false}
        leftButton={leftButton}
        rightButton={rightButton}
      />
    </MultiPageSheet>
  );
}
