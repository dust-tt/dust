/** Canonical scoped-path prefixes (include the trailing dash). */
export const SCOPED_PREFIX_CONVERSATION = "conversation-" as const;
export const SCOPED_PREFIX_POD = "pod-" as const;
export const SCOPED_PREFIX_USER = "user-" as const;

/** Legacy agent-visible path prefixes (no trailing dash/slash). */
export const LEGACY_PREFIX_CONVERSATION = "conversation" as const;
export const LEGACY_PREFIX_PROJECT = "project" as const;

export const TOOL_OUTPUTS_FOLDER_NAME = ".tool_outputs";

export type CanonicalScopedPathScope =
  | { kind: "canonical-conversation"; id: string }
  | { kind: "canonical-pod"; id: string };

export type ParsedCanonicalScopedPath = {
  scope: CanonicalScopedPathScope;
  relPath: string;
};

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

export function conversationScopedPath({
  conversationId,
  rel,
}: {
  conversationId: string;
  rel: string;
}): string {
  return `${SCOPED_PREFIX_CONVERSATION}${conversationId}/${rel}`;
}

export function podScopedPath(spaceId: string, rel: string): string {
  return `${SCOPED_PREFIX_POD}${spaceId}/${rel}`;
}

export function userScopedPath(userId: string, rel: string): string {
  return `${SCOPED_PREFIX_USER}${userId}/${rel}`;
}
