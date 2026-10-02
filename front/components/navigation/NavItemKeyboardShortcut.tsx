import { cn, KeyboardShortcut } from "@dust-tt/sparkle";

const KEY_CAP_CLASS_NAME = cn(
  "inline-flex h-5 min-w-5 items-center justify-center rounded border px-1",
  "border-separator text-xs shadow-xs"
);

interface NavItemKeyboardShortcutProps {
  /** Individual key caps to show, e.g. `["Cmd", "K"]` or `["Ctrl", "/"]`. */
  keys: string[];
}

/**
 * Compact keyboard-shortcut hint for NavigationListItem suffixes.
 */
export function NavItemKeyboardShortcut({
  keys,
}: NavItemKeyboardShortcutProps) {
  return (
    <span className="flex items-center gap-0.5">
      {keys.map((key) => (
        <KeyboardShortcut
          key={key}
          shortcut={key}
          className={KEY_CAP_CLASS_NAME}
        />
      ))}
    </span>
  );
}
