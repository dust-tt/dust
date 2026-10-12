import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { Button, cn, XClose } from "@dust-tt/sparkle";
import type React from "react";

interface ConversationSidePanelHeaderProps {
  children?: React.ReactNode;
  /** Shown at the right, next to the close button. */
  actions?: React.ReactNode;
  onClose?: () => void;
  /** Keeps the close button visible but inert, while leaving would lose work. */
  closeDisabled?: boolean;
}

export function ConversationSidePanelHeader({
  children,
  actions,
  onClose,
  closeDisabled = false,
}: ConversationSidePanelHeaderProps) {
  return (
    <AppLayoutTitle className="bg-panel-background @container">
      <div className="flex h-full items-center">
        {children}
        {(actions || onClose) && (
          <div
            className={cn(
              "ml-auto flex shrink-0 items-center gap-1",
              actions && "pl-2"
            )}
          >
            {actions}
            {onClose && (
              <Button
                variant="ghost"
                onClick={onClose}
                icon={XClose}
                disabled={closeDisabled}
                className="text-element-600 hover:text-element-900"
              />
            )}
          </div>
        )}
      </div>
    </AppLayoutTitle>
  );
}
