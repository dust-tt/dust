/**
 * True when `?agent=` looks like a mirrored previous default rather than an
 * intentional deep link: the configured default just changed, and the URL still
 * names the old default. Callers should strip the param and re-apply the new
 * default so settings changes and Pod switches are not blocked by sticky URL state.
 */
export function isStaleMirroredDefaultAgentParam({
  agentSearchParam,
  previousDefaultAgentId,
  nextDefaultAgentId,
  hasResolvedDefault,
}: {
  agentSearchParam: string | null | undefined;
  previousDefaultAgentId: string | null | undefined;
  nextDefaultAgentId: string | null | undefined;
  hasResolvedDefault: boolean;
}): boolean {
  if (!hasResolvedDefault || !agentSearchParam) {
    return false;
  }
  if (previousDefaultAgentId === nextDefaultAgentId) {
    return false;
  }
  return agentSearchParam === previousDefaultAgentId;
}
