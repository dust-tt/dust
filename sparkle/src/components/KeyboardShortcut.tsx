import * as React from "react";

import { cn } from "@sparkle/lib/utils";

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

type ArrowKey = "arrowup" | "up" | "arrowdown" | "down" | "arrowleft" | "left" | "arrowright" | "right";

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

const normalizeKey = (rawKey: string) => {
  const trimmed = rawKey.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (lower in KEY_SYMBOLS) {
    return KEY_SYMBOLS[lower as KeySymbolKey];
  }

  if (lower in ARROW_KEYS) {
    return ARROW_KEYS[lower as ArrowKey];
  }

  if (/^f\d{1,2}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  if (/^[a-z]$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  return trimmed.length > 1
    ? `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}`
    : trimmed;
};

export interface KeyboardShortcutProps extends React.HTMLAttributes<HTMLSpanElement> {
  shortcut: string;
}

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
        "s-inline-flex s-items-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night",
        className
      )}
      aria-label={shortcut}
      title={shortcut}
      {...props}
    >
      {keys.map((key, index) => (
        <React.Fragment key={`${key}-${index}`}>
          <span className="s-tracking-widest">{key}</span>
          {hasSeparator && index < keys.length - 1 && (
            <span className="s-mx-0.5">+</span>
          )}
        </React.Fragment>
      ))}
    </span>
  );
};
