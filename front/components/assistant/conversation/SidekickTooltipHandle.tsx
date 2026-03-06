import { useHasSeenSidekickTooltip } from "@app/hooks/useHasSeenSidekickTooltip";
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

const SIDEKICK_TOOLTIP_INTRO = "👋 Hey! I'm Sidekick.";
const SIDEKICK_TOOLTIP_BODY =
  "Let's make an agent together. If you can dream it, I can build it.";
const SIDEKICK_TOOLTIP_AUTO_OPEN_DELAY_MS = 600;

interface SidekickTooltipHandleProps {
  agent: {
    sId: string;
    name: string;
  };
}

export function SidekickTooltipHandle({ agent }: SidekickTooltipHandleProps) {
  const { hasSeen, markAsSeen } = useHasSeenSidekickTooltip();
  const [isOpen, setIsOpen] = useState(false);
  const hasAutoOpened = useRef(false);

  useEffect(() => {
    if (hasSeen || hasAutoOpened.current) {
      return;
    }
    hasAutoOpened.current = true;
    const id = setTimeout(() => {
      setIsOpen(true);
    }, SIDEKICK_TOOLTIP_AUTO_OPEN_DELAY_MS);
    return () => clearTimeout(id);
  }, [hasSeen]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open && !hasSeen) {
        markAsSeen();
      }
    },
    [hasSeen, markAsSeen]
  );

  return (
    <TooltipProvider delayDuration={300}>
      <TooltipRoot open={isOpen} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <span
            className="cursor-default transition duration-200 hover:text-highlight"
            tabIndex={0}
            role="note"
            aria-label={`${agent.name} — ${SIDEKICK_TOOLTIP_INTRO} ${SIDEKICK_TOOLTIP_BODY}`}
          >
            {agent.name}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="end"
          sideOffset={4}
          showArrow
          className="s-w-64 s-max-w-sm s-rounded-xl s-border s-border-border s-bg-background s-p-1 s-shadow-lg dark:s-border-border-night dark:s-bg-background-night"
        >
          <p className="s-text-sm s-text-foreground dark:s-text-foreground-night">
            {SIDEKICK_TOOLTIP_INTRO}
          </p>
          <p className="s-text-sm s-text-foreground dark:s-text-foreground-night">
            {SIDEKICK_TOOLTIP_BODY}
          </p>
        </TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  );
}
