import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SkillsSheetMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { getPageAndFooter } from "@app/components/agent_builder/skills/skillSheet/utils";
import type { UserType, WorkspaceType } from "@app/types";

interface SkillsSheetProps {
  mode: SkillsSheetMode | null;
  onClose: () => void;
  onSave: (
    skills: AgentBuilderSkillsType[],
    additionalSpaces: string[]
  ) => void;
  onModeChange: (mode: SkillsSheetMode | null) => void;
  owner: WorkspaceType;
  user: UserType;
  initialSelectedSkills: AgentBuilderSkillsType[];
  initialAdditionalSpaces: string[];
  alreadyRequestedSpaceIds: Set<string>;
}

export function SkillsSheet(props: SkillsSheetProps) {
  const { mode, onClose } = props;

  return (
    <MultiPageSheet
      open={mode !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {mode && <SkillsSheetContent {...props} mode={mode} />}
    </MultiPageSheet>
  );
}

function SkillsSheetContent({
  mode,
  onClose,
  onSave,
  onModeChange,
  owner,
  user,
  initialSelectedSkills,
  initialAdditionalSpaces,
  alreadyRequestedSpaceIds,
}: SkillsSheetProps & { mode: SkillsSheetMode }) {
  const [localSelectedSkills, setLocalSelectedSkills] = useState<
    AgentBuilderSkillsType[]
  >(initialSelectedSkills);
  const [localAdditionalSpaces, setLocalAdditionalSpaces] = useState<string[]>(
    initialAdditionalSpaces
  );

  const handleSave = useCallback(() => {
    onSave(localSelectedSkills, localAdditionalSpaces);
    onClose();
  }, [localSelectedSkills, localAdditionalSpaces, onSave, onClose]);

  const { page, leftButton, rightButton } = getPageAndFooter({
    mode,
    onModeChange,
    onClose,
    handleSave,
    owner,
    user,
    alreadyRequestedSpaceIds,
    localSelectedSkills,
    setLocalSelectedSkills,
    localAdditionalSpaces,
    setLocalAdditionalSpaces,
  });

  return (
    <MultiPageSheetContent
      pages={[page]}
      currentPageId={mode.pageId}
      onPageChange={() => {}}
      size="xl"
      addFooterSeparator
      showHeaderNavigation={false}
      showNavigation={false}
      leftButton={leftButton}
      rightButton={rightButton}
    />
  );
}
