import escape from "lodash/escape";
import unescape from "lodash/unescape";
import { z } from "zod";

export const FRAME_EMBED_DIRECTIVE_NAME = "embed_frame";
export const FRAME_EMBED_COMPONENT_NAME = "frame_embed";

export type FrameEmbedProps = Record<string, string>;

const ESCAPED_ATTRIBUTE_CHARACTER = String.raw`(?:[^"&<>'\n]|&(?:amp|lt|gt|quot|#39);)`;

const FRAME_EMBED_PROP_NAME = "[A-Za-z][A-Za-z0-9_]*";

const FRAME_EMBED_RESERVED_ATTRIBUTES = new Set(["path", "height"]);

const FRAME_EMBED_DIRECTIVE_REGEX = new RegExp(
  String.raw`^::${FRAME_EMBED_DIRECTIVE_NAME}\{path="(${ESCAPED_ATTRIBUTE_CHARACTER}+)"(?: height="([1-9]\d{0,4})")?((?: ${FRAME_EMBED_PROP_NAME}="${ESCAPED_ATTRIBUTE_CHARACTER}*")*)\}[ \t]*(?:\n|$)`
);

const FRAME_EMBED_PROP_REGEX = new RegExp(
  String.raw` (${FRAME_EMBED_PROP_NAME})="(${ESCAPED_ATTRIBUTE_CHARACTER}*)"`,
  "g"
);

const FRAME_EMBED_PROP_NAME_REGEX = new RegExp(`^${FRAME_EMBED_PROP_NAME}$`);

const MAX_FRAME_EMBED_HEIGHT_PX = 99999;

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

function parseFrameEmbedPropsSource(source: string): FrameEmbedProps | null {
  const props: FrameEmbedProps = {};
  for (const [, name, value] of source.matchAll(FRAME_EMBED_PROP_REGEX)) {
    if (
      FRAME_EMBED_RESERVED_ATTRIBUTES.has(name) ||
      Object.hasOwn(props, name)
    ) {
      return null;
    }
    props[name] = unescape(value);
  }
  return props;
}

/**
 * @cc [owner:tdraier,label:product] frame-embed-directive
 * A frame embed MUST be read only from a line holding exactly `::embed_frame{path="<path>"}`,
 * then optionally ` height="<height>"`, then any number of ` <name>="<value>"` props, before the
 * closing `}`, trailing spaces aside. Its path MUST be HTML-escaped and non-empty, its height in
 * plain digits a height `parseFrameEmbedHeight` accepts, and each prop a distinct name of a letter
 * then letters, digits or `_`, other than `path` and `height`, with an HTML-escaped value; anything else MUST NOT parse, so a
 * writer never drops what the directive does not define. `serializeFrameEmbedDirective` MUST
 * write a line this function reads back to the same path, height and props, in order, for any
 * path `isFrameEmbedPath`, height `parseFrameEmbedHeight` and props `parseFrameEmbedProps`
 * accept. The directive name MUST keep a `_`, which the editor writes escaped in text, so text
 * that reads as the directive saves as `::embed\_frame` and reopens as text.
 */
export function parseFrameEmbedDirective(src: string): {
  path: string;
  height: number | null;
  props: FrameEmbedProps;
  raw: string;
} | null {
  const match = src.match(FRAME_EMBED_DIRECTIVE_REGEX);
  if (!match) {
    return null;
  }
  const props = parseFrameEmbedPropsSource(match[3]);
  return props
    ? {
        path: unescape(match[1]),
        height: match[2] ? Number(match[2]) : null,
        props,
        raw: match[0],
      }
    : null;
}

export function serializeFrameEmbedDirective(
  path: string,
  height: number | null = null,
  props: FrameEmbedProps = {}
): string {
  const propsSource = Object.entries(props)
    .map(([name, value]) => ` ${name}="${escape(value)}"`)
    .join("");
  return `::${FRAME_EMBED_DIRECTIVE_NAME}{path="${escape(path)}"${
    height !== null ? ` height="${height}"` : ""
  }${propsSource}}`;
}

/** A height the directive can hold, in pixels, or null. */
export function parseFrameEmbedHeight(value: unknown): number | null {
  const height = typeof value === "number" ? value : Number(value);
  return Number.isInteger(height) &&
    height > 0 &&
    height <= MAX_FRAME_EMBED_HEIGHT_PX
    ? height
    : null;
}

export function isFrameEmbedPath(path: string): boolean {
  return path.length > 0 && !/[\r\n]/.test(path);
}

function isFrameEmbedPropName(name: string): boolean {
  return (
    FRAME_EMBED_PROP_NAME_REGEX.test(name) &&
    !FRAME_EMBED_RESERVED_ATTRIBUTES.has(name)
  );
}

const FrameEmbedPropsSchema = z.record(
  z.string().refine(isFrameEmbedPropName),
  z.string().regex(/^[^\r\n]*$/)
);

/** `value` as props if the directive can hold them all, or none. */
export function parseFrameEmbedProps(value: unknown): FrameEmbedProps {
  const parsed = FrameEmbedPropsSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** The props `parseFrameEmbedProps` reads from JSON, or none from invalid JSON. */
export function parseFrameEmbedPropsJson(
  json: string | null | undefined
): FrameEmbedProps {
  if (!json) {
    return {};
  }
  try {
    return parseFrameEmbedProps(JSON.parse(json));
  } catch {
    return {};
  }
}
