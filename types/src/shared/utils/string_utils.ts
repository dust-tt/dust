import { Err, Ok, Result } from "../result";

/**
 * Substring that ensures we don't cut a string in the middle of a unicode
 * character.
 *
 * The split characters are removed from the result. As such the
 * result may be shorter than the requested length. As a consequence,
 * safeSubstring(0,K) + safeSubstring(K) may not be equal to the original
 * string.
 *
 * Read more:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String#utf-16_characters_unicode_code_points_and_grapheme_clusters
 */
export function safeSubstring(
  str: string,
  start: number,
  end?: number
): string {
  while (isTrailingLoneSurrogate(str.charCodeAt(start))) {
    start++;
  }
  if (end === undefined) {
    return str.substring(start);
  }
  while (isLeadingLoneSurrogate(str.charCodeAt(end - 1))) {
    end--;
  }
  return str.substring(start, end);
}

function isLeadingLoneSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isTrailingLoneSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

export function pluralize(count: number) {
  return count !== 1 ? "s" : "";
}

export function sanitizeString(rawString: string) {
  return rawString.trim().toLowerCase();
}

export function slugify(text: string) {
  return text
    .normalize("NFKD") // Normalize to decomposed form.
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics.
    .replace(/([a-z])([A-Z0-9])/g, "$1_$2") // Get all lowercase letters that are near to uppercase ones and replace with _.
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_") // Replace spaces with _.
    .replace(/[\W]+/g, "_") // Replace all non-word characters with _.
    .replace(/__+/g, "_"); // Replace multiple _ with single _.
}

export function isSlugified(text: string) {
  return /^[a-z0-9_]+$/.test(text);
}

export function redactString(str: string, n: number) {
  if (typeof str !== "string") {
    return str;
  }

  if (str.length <= n) {
    return str;
  }

  const redacted = "•".repeat(str.length - n) + str.slice(-n);
  return redacted;
}

export function truncate(text: string, length: number, omission = "...") {
  return text.length > length
    ? `${text.substring(0, length - omission.length)}${omission}`
    : text;
}

export function safeParseJSON(str: string): Result<object | null, Error> {
  try {
    const res = JSON.parse(str);

    return new Ok(res);
  } catch (err) {
    if (err instanceof Error) {
      return new Err(err);
    }

    return new Err(new Error("Unexpected error: JSON parsing failed."));
  }
}
