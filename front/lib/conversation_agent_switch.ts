export function getRunningAgentSwitchBlockMessage(agentName: string): string {
  return `Wait for @${agentName} to finish before calling another agent.`;
}
