import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { ArrowLeft, Button, XClose } from "@dust-tt/sparkle";
import type React from "react";

interface ConversationSidePanelHeaderProps {
  children?: React.ReactNode;
  onClose?: () => void;
}

export function ConversationSidePanelHeader({
  children,
  onClose,
}: ConversationSidePanelHeaderProps) {
  const { canGoBack, goBack } = useConversationSidePanelContext();

  return (
    <AppLayoutTitle className="bg-panel-background @container">
      <div className="flex h-full items-center">
        {canGoBack && (
          <Button
            variant="ghost"
            onClick={goBack}
            icon={ArrowLeft}
            tooltip="Back"
            className="text-element-600 hover:text-element-900 mr-1 shrink-0"
          />
        )}
        {children}
        {onClose && (
          <Button
            variant="ghost"
            onClick={onClose}
            icon={XClose}
            className="text-element-600 hover:text-element-900 ml-auto"
          />
        )}
      </div>
    </AppLayoutTitle>
  );
}
