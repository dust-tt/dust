import { SliderToggle } from "@dust-tt/sparkle";

/**
 * An on/off switch built on Sparkle's SliderToggle visual. SliderToggle
 * itself renders a div with no role, name or keyboard support, so this wraps
 * it in a real button with the switch role: Tab reaches it, Space and Enter
 * flip it, and assistive tech announces the label and state.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className="shrink-0 rounded-full focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
    >
      <SliderToggle selected={checked} disabled={disabled} />
    </button>
  );
}
