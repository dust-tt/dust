import { Check, Icon, X } from "@dust-tt/sparkle";

interface ModelPickerSelectionIndicatorProps {
  // Whether the current selection can be reverted (i.e. it differs from the
  // agent default). When false, a plain, non-interactive check is shown.
  canRevert: boolean;
  onRevert: () => void;
}

// The trailing marker on the active row: a check that turns into a clickable X
// on hover, reverting the selection to the agent default.
export function ModelPickerSelectionIndicator({
  canRevert,
  onRevert,
}: ModelPickerSelectionIndicatorProps) {
  if (!canRevert) {
    return <Icon visual={Check} size="sm" className="text-muted-foreground" />;
  }

  return (
    <button
      type="button"
      aria-label="Revert to default"
      className="group/indicator flex items-center justify-center text-muted-foreground hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        onRevert();
      }}
    >
      <Icon visual={Check} size="sm" className="group-hover/indicator:hidden" />
      <Icon
        visual={X}
        size="sm"
        className="hidden group-hover/indicator:block"
      />
    </button>
  );
}
