import { Check, Icon, X } from "@dust-tt/sparkle";

interface ModelPickerSelectionIndicatorProps {
  // Whether the current selection can be reverted (i.e. it differs from the
  // agent default). When false, a plain, non-interactive check is shown.
  canRevert: boolean;
  onRevert: () => void;
  // "xs" is used on rows where the check sits next to the resolved model label
  size?: "xs" | "sm";
}

// The trailing marker on the active row: a check that turns into a clickable X
// on hover, reverting the selection to the agent default.
export function ModelPickerSelectionIndicator({
  canRevert,
  onRevert,
  size = "sm",
}: ModelPickerSelectionIndicatorProps) {
  if (!canRevert) {
    return (
      <Icon visual={Check} size={size} className="text-muted-foreground" />
    );
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
      <Icon
        visual={Check}
        size={size}
        className="group-hover/indicator:hidden"
      />
      <Icon
        visual={X}
        size={size}
        className="hidden group-hover/indicator:block"
      />
    </button>
  );
}
