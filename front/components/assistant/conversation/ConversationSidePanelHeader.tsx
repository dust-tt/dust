import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { Button, XClose } from "@dust-tt/sparkle";
import type React from "react";

interface ConversationSidePanelHeaderProps {
  children?: React.ReactNode;
  onClose?: () => void;
  /** Keeps the close button visible but inert, while leaving would lose work. */
  closeDisabled?: boolean;
}

export function ConversationSidePanelHeader({
  children,
  onClose,
  closeDisabled = false,
}: ConversationSidePanelHeaderProps) {
  return (
    <AppLayoutTitle className="bg-panel-background @container">
      <div className="flex h-full items-center">
        {children}
        {onClose && (
          <Button
            variant="ghost"
            onClick={onClose}
            icon={XClose}
            disabled={closeDisabled}
            className="text-element-600 hover:text-element-900 ml-auto"
          />
        )}
      </div>
    </AppLayoutTitle>
  );
}
