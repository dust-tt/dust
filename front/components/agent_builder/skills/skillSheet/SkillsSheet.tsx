import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React from "react";

import type { AgentBuilderSkillsType } from "@app/components/agent_builder/AgentBuilderFormContext";
import type { SkillsSheetMode } from "@app/components/agent_builder/skills/skillSheet/types";
import { getPageAndFooter } from "@app/components/agent_builder/skills/skillSheet/utils";

interface SkillsSheetProps {
  mode: SkillsSheetMode | null;
  onClose: () => void;
  onSave: (skills: AgentBuilderSkillsType[]) => void;
  onModeChange: (mode: SkillsSheetMode | null) => void;
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
}: SkillsSheetProps & { mode: SkillsSheetMode }) {
  const { page, leftButton, rightButton } = getPageAndFooter({
    mode,
    onModeChange,
    onClose,
    onSave,
  });

  return (
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
  );
}
