import type {
  CursorAgent,
  CursorAgentSummary,
  CursorRun,
} from "@app/lib/api/actions/servers/cursor_cloud_agents/schemas";

function optionalLine(label: string, value: unknown): string | null {
  return value === undefined || value === null || value === ""
    ? null
    : `- ${label}: ${String(value)}`;
}

// Takes the full agent rather than the summary: `repos` only exists on the full shape, and the
// summary schema's passthrough would let an arbitrary `repos` value through unvalidated.
export function renderAgent(agent: CursorAgent): string {
  const lines = [
    `## ${agent.name ?? "Cursor Cloud Agent"}`,
    `- ID: ${agent.id}`,
    `- Status: ${agent.status}`,
    `- URL: ${agent.url}`,
    optionalLine("Latest run", agent.latestRunId),
    `- Environment: ${agent.env.type}${agent.env.name ? ` (${agent.env.name})` : ""}`,
    `- Updated: ${agent.updatedAt}`,
  ].filter((line): line is string => line !== null);

  if (agent.repos?.length) {
    lines.push(
      "",
      "### Repositories",
      ...agent.repos.map(
        (repo) =>
          `- ${repo.url}${repo.prUrl ? ` — PR: ${repo.prUrl}` : repo.startingRef ? ` @ ${repo.startingRef}` : ""}`
      )
    );
  }
  return lines.join("\n");
}

export function renderAgentList(
  agents: CursorAgentSummary[],
  nextCursor?: string
): string {
  if (agents.length === 0) {
    return "No Cursor Cloud Agents found.";
  }
  return [
    `Found ${agents.length} Cursor Cloud Agent${agents.length === 1 ? "" : "s"}.`,
    "",
    ...agents.map(
      (agent) =>
        `- **${agent.name ?? agent.id}** — ${agent.status}; ID: ${agent.id}; latest run: ${agent.latestRunId ?? "none"}; [Open](${agent.url})`
    ),
    ...(nextCursor ? ["", `Next cursor: \`${nextCursor}\``] : []),
  ].join("\n");
}

export function renderRun(run: CursorRun): string {
  const lines = [
    `## Cursor run ${run.id}`,
    `- Agent ID: ${run.agentId}`,
    `- Status: ${run.status}`,
    optionalLine(
      "Duration",
      run.durationMs ? `${run.durationMs} ms` : undefined
    ),
    `- Updated: ${run.updatedAt}`,
  ].filter((line): line is string => line !== null);

  if (run.result) {
    lines.push("", "### Result", run.result);
  }
  if (run.git?.branches.length) {
    lines.push(
      "",
      "### Git",
      ...run.git.branches.map(
        (branch) =>
          `- ${branch.repoUrl}${branch.branch ? ` — \`${branch.branch}\`` : ""}${branch.prUrl ? ` — [Pull request](${branch.prUrl})` : ""}`
      )
    );
  }
  return lines.join("\n");
}

export function renderRunList(runs: CursorRun[], nextCursor?: string): string {
  if (runs.length === 0) {
    return "No runs found for this Cursor Cloud Agent.";
  }
  return [
    `Found ${runs.length} run${runs.length === 1 ? "" : "s"}.`,
    "",
    ...runs.map(
      (run) =>
        `- ${run.id} — ${run.status}; updated ${run.updatedAt}${run.durationMs ? `; ${run.durationMs} ms` : ""}`
    ),
    ...(nextCursor ? ["", `Next cursor: \`${nextCursor}\``] : []),
  ].join("\n");
}
