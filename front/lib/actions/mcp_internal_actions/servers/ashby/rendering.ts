import type {
  AshbyCandidate,
  AshbyReportSynchronousResponse,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";

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

export function renderReportInfo(
  response: AshbyReportSynchronousResponse,
  reportId: string
): string {
  const { reportData } = response.results;
  const [_headerRow, ...dataRows] = reportData.data;

  return (
    `Report data retrieved successfully!\n\n` +
    `Report ID: ${reportId}\n` +
    `Title: ${reportData.metadata.title}\n` +
    `Updated: ${reportData.metadata.updatedAt}\n` +
    `Rows: ${dataRows.length}\n` +
    `Fields: ${reportData.columnNames.join(", ")}\n\n` +
    "The data has been saved as a CSV file."
  );
}
