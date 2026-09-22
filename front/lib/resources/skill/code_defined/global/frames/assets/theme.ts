import type { CSSProperties } from "react";

// Edit these values for the Frame's audience, subject and brand.
export const theme = {
  background: "#ffffff",
  foreground: "#20252b",
  muted: "#59636e",
  accent: "#315b8c",
  surface: "#f1f4f7",
  border: "#cbd3db",
  bodyFont: "ui-sans-serif, system-ui, sans-serif",
  headingFont: "Georgia, 'Times New Roman', serif",
  bodySize: "1rem",
  headingSize: "clamp(2rem, 5vw, 3.5rem)",
  lineHeight: 1.6,
  pagePadding: "clamp(1.25rem, 4vw, 4rem)",
  radius: "0.75rem",
};

export const tokens: CSSProperties & Record<`--${string}`, string | number> = {
  "--frame-background": theme.background,
  "--frame-foreground": theme.foreground,
  "--frame-muted": theme.muted,
  "--frame-accent": theme.accent,
  "--frame-surface": theme.surface,
  "--frame-border": theme.border,
  "--frame-body-font": theme.bodyFont,
  "--frame-heading-font": theme.headingFont,
  "--frame-body-size": theme.bodySize,
  "--frame-heading-size": theme.headingSize,
  "--frame-line-height": theme.lineHeight,
  "--frame-page-padding": theme.pagePadding,
  "--frame-radius": theme.radius,
};
