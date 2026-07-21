import { Check, Icon, X } from "@dust-tt/sparkle";

interface RevertToDefaultIndicatorProps {
  // When false the current selection already is the default, so there is nothing
  // to revert: render a plain, non-interactive check.
  canRevert: boolean;
  onRevert: () => void;
}

// The check that marks the current selection. When the selection differs from
// the default, hovering anywhere on the row (the `group/model-row` ancestor)
// turns the check into a clickable X that reverts to the default model.
export function RevertToDefaultIndicator({
  canRevert,
  onRevert,
}: RevertToDefaultIndicatorProps) {
  if (!canRevert) {
    return (
      <Icon
        visual={Check}
        size="xs"
        className="text-muted-foreground dark:text-muted-foreground-night"
      />
    );
  }

  return (
    <button
      type="button"
      aria-label="Revert to default model"
      className="flex items-center text-muted-foreground dark:text-muted-foreground-night"
      // Stop the surrounding dropdown row from treating this as a
      // (re)selection, so the click only reverts and keeps the menu open.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onRevert();
      }}
    >
      <Icon visual={Check} size="xs" className="group-hover/model-row:hidden" />
      <Icon
        visual={X}
        size="xs"
        className="hidden group-hover/model-row:block"
      />
    </button>
  );
}
