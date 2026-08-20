import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { MessageConsumptionBreakdown } from "@app/components/assistant/conversation/MessageConsumptionBreakdown";
import { useAgentMessageConsumption } from "@app/hooks/conversations/useAgentMessageConsumption";
import {
  Button,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";

interface CreditCostPopoverProps {
  conversationId: string;
  credits: number | null | undefined;
  messageId: string;
  subAgentCredits: number | null | undefined;
  trigger: ReactElement;
  workspaceId: string;
}

export function CreditCostPopover({
  conversationId,
  credits,
  messageId,
  subAgentCredits,
  trigger,
  workspaceId,
}: CreditCostPopoverProps) {
  const headingId = useId();
  const [hasOpened, setHasOpened] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  // Avoid reopening the trigger tooltip when switching to the credits drawer.
  const preventTriggerFocusOnCloseRef = useRef(false);
  const { currentPanel, openPanel } = useConversationSidePanelContext();
  const { consumption, isConsumptionLoading, mutateConsumption } =
    useAgentMessageConsumption({
      conversationId,
      workspaceId,
      messageId,
      disabled: !hasOpened,
    });

  const totalCredits =
    consumption?.totalBilledCredits ??
    (consumption?.billedCredits ?? credits ?? 0) + (subAgentCredits ?? 0);
  const details = consumption?.details;

  if (totalCredits <= 0) {
    return null;
  }

  return (
    <PopoverRoot
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          return;
        }
        if (hasOpened) {
          void mutateConsumption();
        } else {
          setHasOpened(true);
        }
      }}
    >
      <Tooltip
        label="View consumption breakdown"
        tooltipTriggerAsChild
        trigger={<PopoverTrigger asChild>{trigger}</PopoverTrigger>}
      />
      <PopoverContent
        role="dialog"
        aria-labelledby={headingId}
        align="start"
        className="w-80 rounded-2xl px-3 py-2 shadow-sm"
        preventAutoFocusOnClose={false}
        onCloseAutoFocus={(event) => {
          if (preventTriggerFocusOnCloseRef.current) {
            event.preventDefault();
            preventTriggerFocusOnCloseRef.current = false;
          }
        }}
      >
        <MessageConsumptionBreakdown
          details={details}
          headingId={headingId}
          isLoading={isConsumptionLoading && !consumption}
          totalCredits={totalCredits}
        />

        {currentPanel !== "credits" && (
          <div className="-mx-3 -mb-2 border-t border-border px-3 py-1">
            <Button
              variant="highlight-ghost"
              size="sm"
              label="Credit usage"
              className="w-full"
              onClick={() => {
                preventTriggerFocusOnCloseRef.current = true;
                setIsOpen(false);
                openPanel({ type: "credits" });
              }}
            />
          </div>
        )}
      </PopoverContent>
    </PopoverRoot>
  );
}
