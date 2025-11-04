import type { AshbyCandidate } from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";

function renderCandidate(candidate: AshbyCandidate): string {
  const lines = [`ID: ${candidate.id}`, `Name: ${candidate.name}`];

  if (candidate.primaryEmailAddress) {
    lines.push(`Email: ${candidate.primaryEmailAddress.value}`);
  }

  if (candidate.phoneNumbers && candidate.phoneNumbers.length > 0) {
    lines.push(
      `Phone: ${candidate.phoneNumbers.map((p) => p.value).join(", ")}`
    );
  }

  if (candidate.createdAt) {
    lines.push(`Created: ${new Date(candidate.createdAt).toISOString()}`);
  }

  return lines.join("\n");
}

export function renderCandidateList(candidates: AshbyCandidate[]): string {
  return candidates.map(renderCandidate).join("\n\n---\n\n");
}
