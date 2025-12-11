import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SkillsSheetMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { getPageAndFooter } from "@app/components/agent_builder/skills/skillSheet/utils";

interface SkillsSheetProps {
  mode: SkillsSheetMode;
  onClose: () => void;
  onSave: (skills: AgentBuilderSkillsType[]) => void;
  onModeChange: (mode: SkillsSheetMode | null) => void;
}

export function SkillsSheet({
  mode,
  onClose,
  onSave,
  onModeChange,
}: SkillsSheetProps) {
  const { page, leftButton, rightButton } = getPageAndFooter({
    mode,
    onModeChange,
    onClose,
    onSave,
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
