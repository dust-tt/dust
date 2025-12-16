import { useCallback, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SelectionMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { useSkillConfigurationsWithRelations } from "@app/lib/swr/skill_configurations";
import type {
  SkillRelations,
  SkillType,
} from "@app/types/assistant/skill_configuration";

export const useLocalSelectedSkills = ({
  mode,
  onSave,
  onClose,
}: {
  mode: SelectionMode;
  onSave: (skills: AgentBuilderSkillsType[]) => void;
  onClose: () => void;
}) => {
  const { owner } = useAgentBuilderContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [localSelectedSkills, setLocalSelectedSkills] = useState<
    AgentBuilderSkillsType[]
  >(mode.selectedSkills);

  const {
    skillConfigurationsWithRelations,
    isSkillConfigurationsWithRelationsLoading,
  } = useSkillConfigurationsWithRelations({
    owner,
    disabled: !open,
    status: "active",
  });

  const selectedSkillIds = useMemo(
    () => new Set(localSelectedSkills.map((s) => s.sId)),
    [localSelectedSkills]
  );

  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return skillConfigurationsWithRelations;
    }
    const query = searchQuery.toLowerCase();
    return skillConfigurationsWithRelations.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.userFacingDescription.toLowerCase().includes(query)
    );
  }, [skillConfigurationsWithRelations, searchQuery]);

  const handleSkillToggle = (skill: SkillType & SkillRelations) => {
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
            description: skill.userFacingDescription,
          },
        ];
      }
    });
  };

  const handleSave = useCallback(() => {
    onSave(localSelectedSkills);
    onClose();
  }, [localSelectedSkills, onSave, onClose]);

  return {
    handleSkillToggle,
    handleSave,
    filteredSkills,
    isSkillsLoading: isSkillConfigurationsWithRelationsLoading,
    searchQuery,
    selectedSkillIds,
    setSearchQuery,
  };
};
