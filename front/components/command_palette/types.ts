import type { ComponentType } from "react";

// A top-level command surfaced in the command palette. Selecting it runs `onSelect`
// immediately and closes the palette (it never enters the per-item action phase).
export interface PaletteActionConfig {
  // Stable unique key used for registration/deduplication.
  id: string;
  label: string;
  description?: string;
  // A Sparkle icon component, rendered via <Icon visual={icon} />.
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
}
