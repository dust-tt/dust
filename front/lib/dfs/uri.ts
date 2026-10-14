import type { DfsObjectId } from "@app/types/dfs";
import { DfsError, isDfsObjectId } from "@app/types/dfs";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

const DFS_URI_PREFIX = "dfs://";
const NAME_SEPARATOR = "--";
const MAX_BASENAME_BYTES = 255;
// One URI component: unreserved characters and percent-encoded bytes.
const URI_COMPONENT_REGEX = /^(?:[A-Za-z0-9\-._~]|%[0-9A-Fa-f]{2})+$/;

export interface ParsedDfsUri {
  anchorId: DfsObjectId;
  // Decoded basenames to walk from the anchor; empty when the URI targets the anchor itself.
  segments: string[];
}

function invalidUri(uri: string, reason: string): Err<DfsError> {
  return new Err(
    new DfsError("invalid_input", `Invalid dfs URI ${uri}: ${reason}.`)
  );
}

function decodeComponent(component: string): string | null {
  if (!URI_COMPONENT_REGEX.test(component)) {
    return null;
  }
  try {
    return decodeURIComponent(component);
  } catch {
    // Percent-encoded bytes that are not valid UTF-8.
    return null;
  }
}

function isValidBasename(name: string): boolean {
  return (
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\0") &&
    Buffer.byteLength(name) <= MAX_BASENAME_BYTES
  );
}

// `encodeURIComponent` leaves `!'()*` as is, but they are not unreserved characters.
function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/**
 * Parses `dfs://[<name>--]<object-id>[/<segment>...]`, see `dfs/design-docs/URI.md`.
 */
/**
 * @cc [owner:fabiencelier,label:security] parse-dfs-uri
 * `parseDfsUri` MUST accept exactly the grammar of `dfs/design-docs/URI.md` and fail with
 * `invalid_input` otherwise. The anchor's name MUST be ignored: only the object ID after its last
 * `--` identifies the anchor. Every returned segment MUST be a decoded stored basename (1–255 UTF-8
 * bytes, no `/` or NUL, not `.` or `..`).
 */
export function parseDfsUri(uri: string): Result<ParsedDfsUri, DfsError> {
  if (!uri.startsWith(DFS_URI_PREFIX)) {
    return invalidUri(uri, `expected the ${DFS_URI_PREFIX} scheme`);
  }
  const [anchor, ...rawSegments] = uri.slice(DFS_URI_PREFIX.length).split("/");
  const separator = anchor.lastIndexOf(NAME_SEPARATOR);
  if (
    separator !== -1 &&
    decodeComponent(anchor.slice(0, separator)) === null
  ) {
    return invalidUri(uri, "invalid name");
  }
  const anchorId =
    separator === -1 ? anchor : anchor.slice(separator + NAME_SEPARATOR.length);
  if (!isDfsObjectId(anchorId)) {
    return invalidUri(uri, "invalid object ID");
  }
  const segments: string[] = [];
  for (const rawSegment of rawSegments) {
    const segment = decodeComponent(rawSegment);
    if (segment === null || !isValidBasename(segment)) {
      return invalidUri(uri, `invalid path segment "${rawSegment}"`);
    }
    segments.push(segment);
  }
  return new Ok({ anchorId, segments });
}

/**
 * Formats a dfs URI anchored at `objectId`. Without `path`, this is the object's canonical URI.
 */
/**
 * @cc [owner:fabiencelier,label:product] format-dfs-uri
 * For a valid object ID and valid basenames, `formatDfsUri` output MUST parse back with
 * `parseDfsUri` to the same anchor ID and path. An empty `name` (the tenant root) MUST be omitted.
 */
export function formatDfsUri(
  objectId: DfsObjectId,
  { name, path = [] }: { name?: string; path?: string[] } = {}
): string {
  const anchor = name
    ? `${encodeComponent(name)}${NAME_SEPARATOR}${objectId}`
    : objectId;
  return [`${DFS_URI_PREFIX}${anchor}`, ...path.map(encodeComponent)].join("/");
}
