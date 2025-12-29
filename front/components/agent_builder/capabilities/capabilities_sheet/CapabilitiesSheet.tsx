import { MultiPageSheet, MultiPageSheetContent } from "@dust-tt/sparkle";
import React from "react";

import type { CapabilitiesSheetContentProps } from "@app/components/agent_builder/capabilities/capabilities_sheet/types";
import { useCapabilitiesPageAndFooter } from "@app/components/agent_builder/capabilities/capabilities_sheet/utils";

export function CapabilitiesSheet(props: CapabilitiesSheetContentProps) {
  const { mode, onClose } = props;

  return (
    <MultiPageSheet
      open={mode.open}
      onOpenChange={(open) => !open && onClose()}
    >
      <CapabilitiesSheetContent {...props} mode={mode} />
    </MultiPageSheet>
  );
}

function CapabilitiesSheetContent(props: CapabilitiesSheetContentProps) {
  const { page, leftButton, rightButton } = useCapabilitiesPageAndFooter(props);

  return (
    <MultiPageSheetContent
      pages={[page]}
      currentPageId={props.mode.pageId}
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
