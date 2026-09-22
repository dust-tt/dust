import type { CSSProperties } from "react";
import { z } from "zod";

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const font = z.enum(["sans", "serif", "mono"]);

export const DocumentThemeSchema = z
  .object({
    bodyFont: font.optional(),
    headingFont: font.optional(),
    bodySize: z.number().min(14).max(22).optional(),
    headingScale: z.number().min(1.1).max(1.4).optional(),
    lineHeight: z.number().min(1.4).max(2).optional(),
    paragraphSpacing: z.number().min(8).max(32).optional(),
    readingWidth: z.number().min(480).max(1100).optional(),
    background: color.optional(),
    foreground: color.optional(),
    muted: color.optional(),
    accent: color.optional(),
    surface: color.optional(),
    border: color.optional(),
    radius: z.number().min(0).max(24).optional(),
  })
  .strict();

export type DocumentTheme = z.infer<typeof DocumentThemeSchema>;

const FONTS = {
  sans: "Geist, ui-sans-serif, system-ui, sans-serif",
  serif: "Lora, Georgia, serif",
  mono: '"Geist Mono", ui-monospace, monospace',
};

const DEFAULT_THEME: Required<DocumentTheme> = {
  bodyFont: "sans",
  headingFont: "sans",
  bodySize: 17,
  headingScale: 1.22,
  lineHeight: 1.7,
  paragraphSpacing: 16,
  readingWidth: 800,
  background: "#ffffff",
  foreground: "#20252b",
  muted: "#59636e",
  accent: "#315b8c",
  surface: "#f1f4f7",
  border: "#cbd3db",
  radius: 12,
};

type DocumentThemeStyle = CSSProperties &
  Record<`--document-${string}`, string | number>;

/**
 * @cc [owner:flvndvd,label:security;product] document-theme-values
 * Themes MUST accept only bounded presentation tokens. Invalid themes MUST fall back
 * without affecting content, editor state or persistence. Omitting a theme MUST retain
 * the existing Document presentation.
 */
export const getDocumentThemeStyle = (
  theme: DocumentTheme | undefined
): DocumentThemeStyle | undefined => {
  if (!theme) {
    return undefined;
  }
  const definedTokens = Object.fromEntries(
    Object.entries(theme).filter(([, value]) => value !== undefined)
  );
  const parsed = DocumentThemeSchema.safeParse(definedTokens);
  if (!parsed.success) {
    return undefined;
  }
  const values = { ...DEFAULT_THEME, ...parsed.data };
  return {
    "--document-font-body": FONTS[values.bodyFont],
    "--document-font-heading": FONTS[values.headingFont],
    "--document-body-size": `${values.bodySize}px`,
    "--document-h1-size": `${values.bodySize * values.headingScale ** 4}px`,
    "--document-h2-size": `${values.bodySize * values.headingScale ** 3}px`,
    "--document-h3-size": `${values.bodySize * values.headingScale ** 2}px`,
    "--document-h4-size": `${values.bodySize * values.headingScale}px`,
    "--document-line-height": values.lineHeight,
    "--document-spacing": `${values.paragraphSpacing}px`,
    "--document-width": `${values.readingWidth}px`,
    "--document-background": values.background,
    "--document-foreground": values.foreground,
    "--document-muted": values.muted,
    "--document-accent": values.accent,
    "--document-surface": values.surface,
    "--document-border": values.border,
    "--document-radius": `${values.radius}px`,
  };
};
