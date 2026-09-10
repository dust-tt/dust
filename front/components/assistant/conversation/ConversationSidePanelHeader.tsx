import { SidePanelCloseButton } from "@app/components/assistant/conversation/SidePanelCloseButton";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import type React from "react";

interface ConversationSidePanelHeaderProps {
  children?: React.ReactNode;
  onClose?: () => void;
}

export function ConversationSidePanelHeader({
  children,
  onClose,
}: ConversationSidePanelHeaderProps) {
  return (
    <AppLayoutTitle className="bg-panel-background @container">
      <div className="flex h-full items-center">
        {children}
        {onClose && (
          <SidePanelCloseButton
            onClick={onClose}
            className="text-element-600 hover:text-element-900 ml-auto"
          />
        )}
      </div>
    </AppLayoutTitle>
  );
}
