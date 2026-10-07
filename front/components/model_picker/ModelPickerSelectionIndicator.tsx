import { Check, Icon, XClose } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";

interface ModelPickerSelectionIndicatorProps {
  // Passed only when the selection can be reverted (i.e. it differs from the
  // agent default). Otherwise a plain, non-interactive check is shown.
  onRevert?: () => void;
  // "xs" is used on rows where the check sits next to the resolved model label
  size?: "xs" | "sm";
}

// The trailing marker on the active row: a check that turns into a clickable X
// on hover, reverting the selection to the agent default.
export function ModelPickerSelectionIndicator({
  onRevert,
  size = "sm",
}: ModelPickerSelectionIndicatorProps) {
  const { t } = useLingui();

  if (!onRevert) {
    return <Icon visual={Check} size={size} className="text-foreground" />;
  }

  return (
    <button
      type="button"
      aria-label={t`Revert to default`}
      className="group/indicator flex items-center justify-center text-foreground"
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
        visual={XClose}
        size={size}
        className="hidden group-hover/indicator:block"
      />
    </button>
  );
}
