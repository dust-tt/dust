import escape from "lodash/escape";
import unescape from "lodash/unescape";

export const FRAME_EMBED_DIRECTIVE_NAME = "embed_frame";
export const FRAME_EMBED_COMPONENT_NAME = "frame_embed";

const FRAME_EMBED_DIRECTIVE_REGEX = new RegExp(
  String.raw`^::${FRAME_EMBED_DIRECTIVE_NAME}\{path="((?:[^"&<>'\n]|&(?:amp|lt|gt|quot|#39);)+)"\}[ \t]*(?:\n|$)`
);

const FRAME_EMBED_DIRECTIVE_START_REGEX = new RegExp(
  String.raw`\n::${FRAME_EMBED_DIRECTIVE_NAME}\{`
);

// marked looks for the block that interrupts a paragraph in the paragraph's source after its first
// character, so the start of `src` is not the start of a line.
/** Index of the first line of `src` after its first that may open a frame embed, or -1. */
export function findFrameEmbedDirective(src: string): number {
  const index = src.search(FRAME_EMBED_DIRECTIVE_START_REGEX);
  return index === -1 ? -1 : index + 1;
}

/**
 * @cc [owner:tdraier,label:product] frame-embed-directive
 * A frame embed MUST be read only from a line holding exactly `::embed_frame{path="<path>"}`,
 * trailing spaces aside, its path HTML-escaped and non-empty; anything else MUST NOT parse, so a
 * writer never drops what the directive does not define. `serializeFrameEmbedDirective` MUST write
 * a line this function reads back to the same path for any path `isFrameEmbedPath` accepts. The
 * directive name MUST keep a `_`, which the editor writes escaped in text, so text that reads as
 * the directive saves as `::embed\_frame` and reopens as text.
 */
export function parseFrameEmbedDirective(
  src: string
): { path: string; raw: string } | null {
  const match = src.match(FRAME_EMBED_DIRECTIVE_REGEX);
  return match ? { path: unescape(match[1]), raw: match[0] } : null;
}

export function serializeFrameEmbedDirective(path: string): string {
  return `::${FRAME_EMBED_DIRECTIVE_NAME}{path="${escape(path)}"}`;
}

export function isFrameEmbedPath(path: string): boolean {
  return path.length > 0 && !/[\r\n]/.test(path);
}
