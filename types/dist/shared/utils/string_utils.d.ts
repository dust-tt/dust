import { Result } from "../result";
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
export declare function safeSubstring(str: string, start: number, end?: number): string;
export declare function pluralize(count: number): "s" | "";
export declare function sanitizeString(rawString: string): string;
export declare function slugify(text: string): string;
export declare function isSlugified(text: string): boolean;
export declare function redactString(str: string, n: number): string;
export declare function truncate(text: string, length: number, omission?: string): string;
export declare function safeParseJSON(str: string): Result<object | null, Error>;
export declare function stripNullBytes(text: string): string;
//# sourceMappingURL=string_utils.d.ts.map