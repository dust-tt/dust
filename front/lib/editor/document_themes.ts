import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
const THEME_LINE_WITH_VALUE = /^theme[ \t]*:[ \t]*[^\s#]/;
const CONTINUATION_LINE = /^[ \t]/;

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

/**
 * @cc [owner:tdraier,label:product] document-theme-write
 * Setting a theme MUST return front matter that `getDocumentTheme` reads as that theme, with
 * every other line kept in order and unchanged: front matter already read as that theme MUST be
 * returned as is; otherwise the `theme` key line is replaced in place, appended when missing,
 * or removed for `DEFAULT_DOCUMENT_THEME`, and front matter left with only blank lines MUST
 * become null. A repeated `theme` key, or one whose value spans several lines, MUST be refused.
 */
export function withDocumentTheme(
  frontMatter: string | null,
  theme: DocumentTheme
): Result<string | null, string> {
  if (getDocumentTheme(frontMatter) === theme) {
    return new Ok(frontMatter);
  }

  const lines =
    frontMatter === null || frontMatter.trim() === ""
      ? []
      : frontMatter.split("\n");
  const keyIndexes = lines.flatMap((line, index) =>
    THEME_KEY_LINE.test(line) ? [index] : []
  );
  if (keyIndexes.length > 1) {
    return new Err("The front matter repeats the `theme` key.");
  }

  const themeLines =
    theme === DEFAULT_DOCUMENT_THEME ? [] : [`theme: ${theme}`];
  const [keyIndex] = keyIndexes;
  if (keyIndex === undefined) {
    return new Ok([...lines, ...themeLines].join("\n"));
  }
  if (
    !THEME_LINE_WITH_VALUE.test(lines[keyIndex]) ||
    CONTINUATION_LINE.test(lines[keyIndex + 1] ?? "")
  ) {
    return new Err("The front matter's `theme` value spans several lines.");
  }

  const updated = [
    ...lines.slice(0, keyIndex),
    ...themeLines,
    ...lines.slice(keyIndex + 1),
  ];
  return new Ok(
    updated.every((line) => line.trim() === "") ? null : updated.join("\n")
  );
}
