import {
  LEGACY_PREFIX_CONVERSATION,
  LEGACY_PREFIX_PROJECT,
  SCOPED_PREFIX_CONVERSATION,
  SCOPED_PREFIX_POD,
} from "@app/types/file_system";

export const LEGACY_PREFIX_POD = "pod" as const;
export const TOOL_OUTPUTS_FOLDER_NAME = ".tool_outputs";

export type CanonicalScopedPathScope =
  | { kind: "canonical-conversation"; id: string }
  | { kind: "canonical-pod"; id: string };

export type ParsedCanonicalScopedPath = {
  scope: CanonicalScopedPathScope;
  relPath: string;
};

export type ScopedFilePathPrefix =
  | typeof LEGACY_PREFIX_CONVERSATION
  | typeof LEGACY_PREFIX_POD;

export type ScopedFilePath = {
  prefix: ScopedFilePathPrefix;
  rel: string;
};

export type ParsedScopedPathScope =
  | CanonicalScopedPathScope
  | { kind: "legacy"; prefix: ScopedFilePathPrefix };

export function parseScopedFilePathPrefix(
  rawScope: string
): ScopedFilePathPrefix | null {
  switch (rawScope) {
    case LEGACY_PREFIX_CONVERSATION:
    case LEGACY_PREFIX_POD:
      return rawScope;
    default:
      return null;
  }
}

export function parseCanonicalScopedPathScope(
  rawScope: string
): CanonicalScopedPathScope | null {
  if (rawScope.startsWith(SCOPED_PREFIX_CONVERSATION)) {
    const id = rawScope.slice(SCOPED_PREFIX_CONVERSATION.length);
    return id ? { kind: "canonical-conversation", id } : null;
  }

  if (rawScope.startsWith(SCOPED_PREFIX_POD)) {
    const id = rawScope.slice(SCOPED_PREFIX_POD.length);
    return id ? { kind: "canonical-pod", id } : null;
  }

  return null;
}

/**
 * Parse a canonical agent-visible scoped path (`conversation-{id}/...`, `pod-{id}/...`)
 * into its scope and path relative to that mount.
 */
export function parseCanonicalScopedPath(
  scopedPath: string
): ParsedCanonicalScopedPath | null {
  const slashIndex = scopedPath.indexOf("/");
  const rawScope =
    slashIndex === -1 ? scopedPath : scopedPath.slice(0, slashIndex);
  const relPath = slashIndex === -1 ? "" : scopedPath.slice(slashIndex + 1);
  const scope = parseCanonicalScopedPathScope(rawScope);

  return scope ? { scope, relPath } : null;
}

export function parseScopedPathScope(
  rawScope: string
): ParsedScopedPathScope | null {
  const canonicalScope = parseCanonicalScopedPathScope(rawScope);
  if (canonicalScope) {
    return canonicalScope;
  }

  const legacyPrefix = parseScopedFilePathPrefix(rawScope);
  return legacyPrefix ? { kind: "legacy", prefix: legacyPrefix } : null;
}

/**
 * Parse a scoped file path like "conversation/chart.png" or "pod/report.pdf".
 * Returns null if the path is missing a valid scope prefix.
 */
export function parseScopedFilePath(filePath: string): ScopedFilePath | null {
  const slashIndex = filePath.indexOf("/");
  if (slashIndex <= 0) {
    return null;
  }

  const prefix = parseScopedFilePathPrefix(filePath.slice(0, slashIndex));
  return prefix ? { prefix, rel: filePath.slice(slashIndex + 1) } : null;
}

function getScopedPathPrefix(scopedPath: string): string | null {
  const slashIndex = scopedPath.indexOf("/");
  return slashIndex > 0 ? scopedPath.slice(0, slashIndex) : null;
}

/**
 * True for canonical agent-visible paths (`conversation-{id}/...`, `pod-{id}/...`).
 * The id segment after the prefix must be non-empty.
 */
export function isCanonicalScopedPath(scopedPath: string): boolean {
  const prefix = getScopedPathPrefix(scopedPath);
  return prefix ? parseCanonicalScopedPathScope(prefix) !== null : false;
}

/** True for legacy bare-prefix paths (`conversation/...`, `pod/...`, `project/...`). */
export function isLegacyScopedPath(scopedPath: string): boolean {
  const prefix = getScopedPathPrefix(scopedPath);
  return (
    prefix === LEGACY_PREFIX_CONVERSATION ||
    prefix === LEGACY_PREFIX_POD ||
    prefix === LEGACY_PREFIX_PROJECT
  );
}

/** True for any agent-visible scoped path (canonical or legacy). */
export function isAgentScopedPath(scopedPath: string): boolean {
  return isCanonicalScopedPath(scopedPath) || isLegacyScopedPath(scopedPath);
}

/** Match a requested legacy scoped path against a stored legacy alias. */
export function legacyScopedPathsMatch(
  storedLegacyPath: string | undefined,
  requestedRef: string
): boolean {
  if (!storedLegacyPath) {
    return false;
  }

  if (storedLegacyPath === requestedRef) {
    return true;
  }

  // Older frame code may request `project/...` while the stored alias uses `pod/...`.
  return (
    requestedRef.startsWith(`${LEGACY_PREFIX_PROJECT}/`) &&
    storedLegacyPath ===
      `${LEGACY_PREFIX_POD}/${requestedRef.slice(`${LEGACY_PREFIX_PROJECT}/`.length)}`
  );
}
