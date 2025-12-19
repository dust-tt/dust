import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React, { useCallback, useState } from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { CapabilitiesSheetMode } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { getPageAndFooter } from "@app/components/agent_builder/capabilities/capabilities_sheet/utils";
import type { UserType, WorkspaceType } from "@app/types";

interface CapabilitiesSheetProps {
  mode: CapabilitiesSheetMode | null;
  onClose: () => void;
  onSave: (
    skills: AgentBuilderSkillsType[],
    additionalSpaces: string[]
  ) => void;
  onModeChange: (mode: CapabilitiesSheetMode | null) => void;
  owner: WorkspaceType;
  user: UserType;
  initialAdditionalSpaces: string[];
  alreadyRequestedSpaceIds: Set<string>;
  alreadyAddedSkillIds: Set<string>;
}

export function CapabilitiesSheet(props: CapabilitiesSheetProps) {
  const { mode, onClose } = props;

  return (
    <MultiPageSheet
      open={mode !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {mode && <CapabilitiesSheetContent {...props} mode={mode} />}
    </MultiPageSheet>
  );
}

function CapabilitiesSheetContent({
  mode,
  onClose,
  onSave,
  onModeChange,
  owner,
  user,
  initialAdditionalSpaces,
  alreadyRequestedSpaceIds,
  alreadyAddedSkillIds,
}: CapabilitiesSheetProps & { mode: CapabilitiesSheetMode }) {
  const [localSelectedSkills, setLocalSelectedSkills] = useState<
    AgentBuilderSkillsType[]
  >([]);
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
    alreadyAddedSkillIds,
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
