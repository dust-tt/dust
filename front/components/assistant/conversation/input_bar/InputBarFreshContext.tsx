import { useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import { Chip, ClockRewind, Tooltip } from "@dust-tt/sparkle";

export const FRESH_CONTEXT_TOOLTIP =
  "Earlier messages won't be used for this run. This message and the " +
  "response will remain in the conversation.";

// Title-cased and sentence-punctuated to match the capability rows it sits alongside.
export const FRESH_CONTEXT_MENU_LABEL = "Use Fresh Context";

export const FRESH_CONTEXT_MENU_DESCRIPTION =
  "Answer without earlier conversation messages.";

export const FRESH_CONTEXT_CHIP_LABEL = "Fresh context · Next message only";

// Narrow viewports drop to the bare concept; the tooltip and aria-label keep the full meaning.
export const FRESH_CONTEXT_CHIP_LABEL_SHORT = "Fresh";

export const FRESH_CONTEXT_CHIP_ARIA_LABEL =
  "Fresh context enabled for the next message";

interface InputBarFreshContextChipProps {
  onRemove: () => void;
}

/**
 * Active-state chip for the per-run "Fresh context" mode, rendered in the composer's chip area
 * alongside selected capabilities and Spaces.
 *
 * The mode is armed from the capabilities menu and is one-shot: `ConversationViewer` clears it
 * once the message is durably accepted, so the chip disappears on its own after a successful send
 * and stays put when a send fails.
 */
export function InputBarFreshContextChip({
  onRemove,
}: InputBarFreshContextChipProps) {
  const isWidthConstrained = useIsWidthConstrained();

  return (
    <Tooltip
      label={FRESH_CONTEXT_TOOLTIP}
      trigger={
        <Chip
          size="xs"
          icon={ClockRewind}
          label={
            isWidthConstrained
              ? FRESH_CONTEXT_CHIP_LABEL_SHORT
              : FRESH_CONTEXT_CHIP_LABEL
          }
          aria-label={FRESH_CONTEXT_CHIP_ARIA_LABEL}
          className="m-0.5 bg-selected text-foreground hover:bg-hover dark:text-foreground-night"
          onRemove={onRemove}
        />
      }
    />
  );
}
