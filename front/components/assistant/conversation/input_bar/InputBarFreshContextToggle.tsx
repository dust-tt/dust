import { useIsWidthConstrained } from "@app/lib/swr/useIsMobile";
import { Button, LayerSingle } from "@dust-tt/sparkle";

export const FRESH_CONTEXT_OFF_TOOLTIP =
  "Fresh context — answer the next message without earlier conversation " +
  "messages. The message and reply stay in this conversation.";

export const FRESH_CONTEXT_ON_TOOLTIP =
  "Fresh context on — earlier conversation messages will be excluded for " +
  "this run. Turns off after sending.";

export const FRESH_CONTEXT_OFF_LABEL = "Use fresh context for the next message";

export const FRESH_CONTEXT_ON_LABEL =
  "Fresh context enabled for the next message";

interface InputBarFreshContextToggleProps {
  buttonSize: "xs" | "sm";
  disabled: boolean;
  isEnabled: boolean;
  onToggle: (isEnabled: boolean) => void;
}

/**
 * One-shot composer control for the per-run "Fresh context" mode. It is not sticky: the caller
 * snapshots the value at submit and clears it once the message is durably accepted.
 *
 * Only rendered for conversations that already have a visible interaction — see
 * `InputBarContainer`, which is where that condition lives.
 */
export function InputBarFreshContextToggle({
  buttonSize,
  disabled,
  isEnabled,
  onToggle,
}: InputBarFreshContextToggleProps) {
  const isWidthConstrained = useIsWidthConstrained();

  return (
    <Button
      variant={isEnabled ? "outline" : "ghost-secondary"}
      size={buttonSize}
      icon={LayerSingle}
      // Icon-only when space is tight; the tooltip and aria-label keep it identifiable.
      label={isWidthConstrained ? undefined : "Fresh context"}
      tooltip={isEnabled ? FRESH_CONTEXT_ON_TOOLTIP : FRESH_CONTEXT_OFF_TOOLTIP}
      aria-pressed={isEnabled}
      aria-label={isEnabled ? FRESH_CONTEXT_ON_LABEL : FRESH_CONTEXT_OFF_LABEL}
      disabled={disabled}
      onClick={() => onToggle(!isEnabled)}
    />
  );
}
