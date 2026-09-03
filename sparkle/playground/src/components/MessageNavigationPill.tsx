import { ArrowDown, ArrowUp, cn, IconButton } from "@dust-tt/sparkle";

/**
 * Mirrors the `variant="floating"` branch of front's
 * `components/assistant/conversation/input_bar/InputBarMessageNavigation.tsx`:
 * a pill on the input-bar surface, absolutely lifted 2rem above the composer.
 * Only the two navigation arrows are shown — the stop button belongs to a
 * generating agent, and here the agent is waiting on the user.
 */

// front: INPUT_BAR_SURFACE_CLASSES
const INPUT_BAR_SURFACE_CLASSES =
  "border border-border-dark bg-muted-background";

interface MessageNavigationPillProps {
  canScrollUp?: boolean;
  canScrollDown?: boolean;
  onScrollUp?: () => void;
  onScrollDown?: () => void;
}

export function MessageNavigationPill({
  canScrollUp = true,
  canScrollDown = true,
  onScrollUp,
  onScrollDown,
}: MessageNavigationPillProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded-xl p-1",
        INPUT_BAR_SURFACE_CLASSES
      )}
      style={{ position: "absolute", top: "-2rem" }}
    >
      <IconButton
        icon={ArrowUp}
        onClick={onScrollUp}
        disabled={!canScrollUp}
        size="xs"
        tooltip="Previous user message"
        aria-label="Previous user message"
      />
      <IconButton
        icon={ArrowDown}
        onClick={onScrollDown}
        disabled={!canScrollDown}
        size="xs"
        tooltip="Next user message"
        aria-label="Next user message"
      />
    </div>
  );
}
