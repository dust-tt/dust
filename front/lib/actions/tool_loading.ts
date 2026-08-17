/**
 * Applies the agent-loop loading policy attached to a tool's source.
 *
 * Tools introduced only through a dynamically enabled skill must remain discoverable through
 * provider-side tool search even when their server metadata marks them eager.
 */
export function applyToolSourceLoadingPolicy<T extends { eager?: boolean }>(
  tool: T,
  { isFromSkillServer }: { isFromSkillServer: boolean }
): T {
  return isFromSkillServer ? { ...tool, eager: undefined } : tool;
}
