import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { panelBackLabel } from "@app/components/assistant/conversation/side_panel_params";
import { Button, XClose } from "@dust-tt/sparkle";

interface SidePanelCloseButtonProps {
  // Defaults to closePanel; a custom handler runs extra cleanup and must end with `closePanel()`.
  onClick?: () => void;
  className?: string;
}

// Always a cross: closing pops back to the previous panel when there is one, and the tooltip
// says so.
export function SidePanelCloseButton({
  onClick,
  className,
}: SidePanelCloseButtonProps) {
  const { previousPanel, closePanel } = useConversationSidePanelContext();
  return (
    <Button
      variant="ghost"
      size="sm"
      icon={XClose}
      tooltip={
        previousPanel ? `Back to ${panelBackLabel(previousPanel)}` : "Close"
      }
      onClick={onClick ?? closePanel}
      className={className}
    />
  );
}
