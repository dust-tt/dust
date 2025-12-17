import { useCallback, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type {
  PageContentProps,
  SelectionMode,
  SkillsSheetMode,
} from "@app/components/agent_builder/skills/skillSheet/types";
import { SKILLS_SHEET_PAGE_IDS } from "@app/components/agent_builder/skills/skillSheet/types";
import { doesSkillTriggerSelectSpaces } from "@app/lib/skill";
import { useSkillsWithRelations } from "@app/lib/swr/skill_configurations";
import type { SkillType } from "@app/types/assistant/skill_configuration";

function isGlobalSkillWithSpaceSelection(skill: SkillType): boolean {
  return doesSkillTriggerSelectSpaces(skill.sId);
}

function getSelectionMode(mode: SkillsSheetMode): SelectionMode {
  if (mode.type === SKILLS_SHEET_PAGE_IDS.SELECTION) {
    return mode;
  }
  return mode.previousMode;
}

export const useSkillSelection = ({
  mode,
  onModeChange,
  localSelectedSkills,
  setLocalSelectedSkills,
  localAdditionalSpaces,
  setLocalAdditionalSpaces,
}: PageContentProps) => {
  const { owner } = useAgentBuilderContext();
  const [searchQuery, setSearchQuery] = useState("");

  // Draft state for space selection (only committed on save)
  const [draftSelectedSpaces, setDraftSelectedSpaces] = useState<string[]>(
    localAdditionalSpaces
  );

  const { skillsWithRelations, isSkillsWithRelationsLoading } =
    useSkillsWithRelations({
      owner,
      status: "active",
    });

  const selectedSkillIds = useMemo(
    () => new Set(localSelectedSkills.map((s) => s.sId)),
    [localSelectedSkills]
  );

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return skillsWithRelations;
    }
    const query = searchQuery.toLowerCase();
    return skillsWithRelations.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.userFacingDescription.toLowerCase().includes(query)
    );
  }, [skillsWithRelations, searchQuery]);

  const selectionMode = getSelectionMode(mode);

  const handleSkillToggle = useCallback(
    (skill: SkillType) => {
      const isAlreadySelected = localSelectedSkills.some(
        (s) => s.sId === skill.sId
      );

      if (isAlreadySelected) {
        setLocalSelectedSkills((prev) =>
          prev.filter((s) => s.sId !== skill.sId)
        );
      } else {
        if (isGlobalSkillWithSpaceSelection(skill)) {
          onModeChange({
            type: SKILLS_SHEET_PAGE_IDS.SPACE_SELECTION,
            skillConfiguration: skill,
            previousMode: selectionMode,
          });
        } else {
          setLocalSelectedSkills((prev) => [
            ...prev,
            {
              sId: skill.sId,
              name: skill.name,
              description: skill.userFacingDescription,
            },
          ]);
        }
      }
    },
    [localSelectedSkills, selectionMode, onModeChange, setLocalSelectedSkills]
  );

  const handleSpaceSelectionSave = useCallback(
    (skill: SkillType) => {
      // Commit draft spaces to actual state
      setLocalAdditionalSpaces(draftSelectedSpaces);
      // Add the skill
      setLocalSelectedSkills((prev: AgentBuilderSkillsType[]) => [
        ...prev,
        {
          sId: skill.sId,
          name: skill.name,
          description: skill.userFacingDescription,
        },
      ]);
      onModeChange(selectionMode);
    },
    [
      selectionMode,
      onModeChange,
      setLocalSelectedSkills,
      setLocalAdditionalSpaces,
      draftSelectedSpaces,
    ]
  );

  return {
    handleSkillToggle,
    filteredSkills,
    isSkillsLoading: isSkillsWithRelationsLoading,
    searchQuery,
    selectedSkillIds,
    setSearchQuery,
    handleSpaceSelectionSave,
    draftSelectedSpaces,
    setDraftSelectedSpaces,
  };
};
