import type {
  AshbyCandidate,
  AshbyFeedbackSubmission,
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

export function renderInterviewFeedbackRecap(
  candidate: AshbyCandidate,
  feedback: AshbyFeedbackSubmission
): string {
  const lines = [
    "# Interview Feedback Recap",
    "",
    `**Candidate:** ${candidate.name}`,
    `**Candidate ID:** ${candidate.id}`,
  ];

  if (candidate.primaryEmailAddress) {
    lines.push(`**Email:** ${candidate.primaryEmailAddress.value}`);
  }

  lines.push("", "---", "");

  if (feedback.formDefinition.title) {
    lines.push(`**Interview Form:** ${feedback.formDefinition.title}`);
  }

  if (feedback.submittedBy) {
    lines.push(
      `**Submitted by:** ${feedback.submittedBy.firstName} ${feedback.submittedBy.lastName} (${feedback.submittedBy.email})`
    );
  }

  if (feedback.submittedAt) {
    lines.push(
      `**Submitted at:** ${new Date(feedback.submittedAt).toISOString()}`
    );
  }

  lines.push("", "## Feedback Details", "");

  if (feedback.values) {
    const fieldMap = new Map(
      feedback.formDefinition.fields?.map((f) => [f.id, f.title ?? f.id]) ?? []
    );

    for (const [fieldId, value] of Object.entries(feedback.values)) {
      const fieldTitle = fieldMap.get(fieldId) ?? fieldId;
      let displayValue = String(value);

      if (typeof value === "object" && value !== null) {
        displayValue = JSON.stringify(value, null, 2);
      }

      lines.push(`**${fieldTitle}:**`);
      lines.push(displayValue);
      lines.push("");
    }
  }

  return lines.join("\n");
}
