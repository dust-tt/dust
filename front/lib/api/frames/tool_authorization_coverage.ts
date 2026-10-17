import type { FrameToolCallPair } from "@app/types/api/frame_publication";

function pairKey([server, tool]: FrameToolCallPair): string {
  return `${server}\0${tool}`;
}

/**
 * Whether every required tool pair appears in the authorized set.
 * Empty `requiredTools` is always satisfied (nothing to consent to).
 */
export function authorizedToolsCoverRequired(
  authorizedTools: FrameToolCallPair[],
  requiredTools: FrameToolCallPair[]
): boolean {
  if (requiredTools.length === 0) {
    return true;
  }
  const authorized = new Set(authorizedTools.map(pairKey));
  return requiredTools.every((pair) => authorized.has(pairKey(pair)));
}
