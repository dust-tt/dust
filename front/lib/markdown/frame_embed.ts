import escape from "lodash/escape";
import unescape from "lodash/unescape";

export const FRAME_EMBED_DIRECTIVE_NAME = "frame";
export const FRAME_EMBED_COMPONENT_NAME = "frame_embed";

const FRAME_EMBED_DIRECTIVE_REGEX = new RegExp(
  String.raw`^::${FRAME_EMBED_DIRECTIVE_NAME}\{path="([^"\n]+)"\}[ \t]*(?:\n|$)`
);

const FRAME_EMBED_DIRECTIVE_START_REGEX = new RegExp(
  String.raw`(^|\n)::${FRAME_EMBED_DIRECTIVE_NAME}\{`
);

/** Index of the first line that may open a frame embed in `src`, or -1. */
export function findFrameEmbedDirective(src: string): number {
  const match = src.match(FRAME_EMBED_DIRECTIVE_START_REGEX);
  return match?.index === undefined ? -1 : match.index + match[1].length;
}

/**
 * @cc [owner:tdraier,label:product] frame-embed-directive
 * A frame embed MUST be read only from a line holding exactly `::frame{path="<path>"}`, trailing
 * spaces aside, its path HTML-escaped and non-empty; anything else MUST NOT parse, so a writer
 * never drops what the directive does not define. `serializeFrameEmbedDirective` MUST write a
 * line this function reads back to the same path.
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
