import type { AshbyCandidate } from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";

function renderCandidate(candidate: AshbyCandidate): string {
  const lines = [`ID: ${candidate.id}`, `Name: ${candidate.name}`];

  if (candidate.primaryEmailAddress) {
    lines.push(
      `Email: ${candidate.primaryEmailAddress.value} (${candidate.primaryEmailAddress.type})`
    );
  }

  if (candidate.primaryPhoneNumber) {
    lines.push(
      `Phone: ${candidate.primaryPhoneNumber.value} (${candidate.primaryPhoneNumber.type})`
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
