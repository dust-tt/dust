import { cn } from "@sparkle/lib/utils";
import * as React from "react";

type KeySymbolKey =
  | "cmd"
  | "command"
  | "meta"
  | "ctrl"
  | "control"
  | "ctl"
  | "alt"
  | "option"
  | "opt"
  | "shift"
  | "enter"
  | "return"
  | "esc"
  | "escape"
  | "tab"
  | "backspace"
  | "delete"
  | "del"
  | "space";

type ArrowKey =
  | "arrowup"
  | "up"
  | "arrowdown"
  | "down"
  | "arrowleft"
  | "left"
  | "arrowright"
  | "right";

const FUNCTION_KEY_REGEX = /^f\d{1,2}$/i;
const SINGLE_LETTER_REGEX = /^[a-z]$/i;

const KEY_SYMBOLS: Record<KeySymbolKey, string> = {
  cmd: "⌘",
  command: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  control: "⌃",
  ctl: "⌃",
  alt: "⌥",
  option: "⌥",
  opt: "⌥",
  shift: "⇧",
  enter: "↵",
  return: "↵",
  esc: "⎋",
  escape: "⎋",
  tab: "⇥",
  backspace: "⌫",
  delete: "⌦",
  del: "⌦",
  space: "Space",
};

const ARROW_KEYS: Record<ArrowKey, string> = {
  arrowup: "↑",
  up: "↑",
  arrowdown: "↓",
  down: "↓",
  arrowleft: "←",
  left: "←",
  arrowright: "→",
  right: "→",
};

const isKeySymbolKey = (value: string): value is KeySymbolKey =>
  value in KEY_SYMBOLS;

const isArrowKey = (value: string): value is ArrowKey => value in ARROW_KEYS;

const normalizeKey = (rawKey: string) => {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (isKeySymbolKey(lower)) {
    return KEY_SYMBOLS[lower];
  }

  if (isArrowKey(lower)) {
    return ARROW_KEYS[lower];
  }

  if (FUNCTION_KEY_REGEX.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (SINGLE_LETTER_REGEX.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed.length > 1
    ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
    : trimmed;
};

export interface KeyboardShortcutProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  /** Shortcut with parts joined by `+` (e.g. "Cmd+K"); modifier and arrow names are normalized to platform symbols. */
  shortcut: string;
}

/**
 * Renders a keyboard shortcut as styled key caps, normalizing modifier and
 * arrow names (Cmd, Shift, ArrowUp, ...) to platform symbols (⌘, ⇧, ↑). Use it
 * to surface the keyboard accelerator for an action, e.g. next to a menu item
 * or in a hint; inside a dropdown, prefer DropdownMenuShortcut, which wraps
 * this component.
 *
 * @summary Styled keyboard shortcut key caps.
 */
export const KeyboardShortcut = ({
  shortcut,
  className,
  ...props
}: KeyboardShortcutProps) => {
  const keys = shortcut.split("+").map(normalizeKey).filter(Boolean);
  const hasSeparator = shortcut.includes("+") && keys.length > 1;

  return (
    <span
      className={cn(
        "inline-flex items-center text-sm text-muted-foreground",
        className
      )}
      aria-label={shortcut}
      title={shortcut}
      {...props}
    >
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          <span className="tracking-widest">{key}</span>
          {hasSeparator && index < keys.length - 1 && (
            <span className="mx-0.5">+</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};
