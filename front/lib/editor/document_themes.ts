export const DOCUMENT_THEMES = ["default", "memo", "report"] as const;

export type DocumentTheme = (typeof DOCUMENT_THEMES)[number];

export const DOCUMENT_THEME_DESCRIPTIONS: Record<DocumentTheme, string> = {
  default: "sans-serif, standard width",
  memo: "serif throughout, narrow column, for letters and memos",
  report: "serif headings, wide page, for reports and specs",
};

export const DEFAULT_DOCUMENT_THEME: DocumentTheme = "default";

const THEME_KEY_LINE = /^theme[ \t]*:/;
const THEME_LINE = /^theme[ \t]*:[ \t]*(["']?)([a-z]+)\1[ \t]*(?:#.*)?$/;

const isDocumentTheme = (value: string): value is DocumentTheme =>
  DOCUMENT_THEMES.some((theme) => theme === value);

/**
 * @cc [owner:tdraier,label:product] document-theme-from-front-matter
 * The theme MUST be the value of the single top-level `theme` key of the front matter, as a plain
 * or quoted name from `DOCUMENT_THEMES`. No front matter, no `theme` key, a repeated key, or any
 * other value MUST yield `DEFAULT_DOCUMENT_THEME`; reading the theme MUST NOT fail.
 */
export function getDocumentTheme(frontMatter: string | null): DocumentTheme {
  if (frontMatter === null) {
    return DEFAULT_DOCUMENT_THEME;
  }

  // Only plain theme names are accepted, so a top-level line is all there is to read and the
  // editor needs no YAML parser; any YAML this misreads falls back to the default.
  const keyLines = frontMatter
    .split("\n")
    .filter((line) => THEME_KEY_LINE.test(line));
  if (keyLines.length !== 1) {
    return DEFAULT_DOCUMENT_THEME;
  }

  const value = THEME_LINE.exec(keyLines[0])?.[2];
  return value !== undefined && isDocumentTheme(value)
    ? value
    : DEFAULT_DOCUMENT_THEME;
}
