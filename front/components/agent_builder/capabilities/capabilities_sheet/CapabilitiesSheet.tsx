import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React from "react";

import type { CapabilitiesSheetContentProps } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { useCapabilitiesPageAndFooter } from "@app/components/agent_builder/capabilities/capabilities_sheet/utils";
import { getCapabilitiesPageId } from "@app/components/agent_builder/skills/types";

export function CapabilitiesSheet(props: CapabilitiesSheetContentProps) {
  const { isOpen, onClose } = props;

  return (
    <MultiPageSheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <CapabilitiesSheetContent {...props} />
    </MultiPageSheet>
  );
}

function CapabilitiesSheetContent(props: CapabilitiesSheetContentProps) {
  const { page, leftButton, rightButton } = useCapabilitiesPageAndFooter(props);

  return (
    <MultiPageSheetContent
      pages={[page]}
      currentPageId={getCapabilitiesPageId(props.sheetState)}
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
