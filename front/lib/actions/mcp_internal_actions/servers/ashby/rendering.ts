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
    "# Interview Feedback",
    "",
    `**Candidate:** ${candidate.name}`,
    `**Candidate ID:** ${candidate.id}`,
  ];

  if (candidate.primaryEmailAddress) {
    lines.push(`**Email:** ${candidate.primaryEmailAddress.value}`);
  }

  lines.push("", "---", "");

  if (feedback.submittedByUser) {
    lines.push(
      `**Submitted by:** ${feedback.submittedByUser.firstName} ${feedback.submittedByUser.lastName} (${feedback.submittedByUser.email})`
    );
  }

  lines.push("", "## Feedback", "");

  if (feedback.submittedValues && feedback.formDefinition.sections) {
    for (const section of feedback.formDefinition.sections) {
      for (const fieldWrapper of section.fields) {
        const field = fieldWrapper.field;
        const value = feedback.submittedValues[field.path];

        if (value === undefined || value === null) {
          continue;
        }

        lines.push(`**${field.title}:**`);

        if (Array.isArray(value)) {
          lines.push(value.join(", "));
        } else if (
          field.type === "ValueSelect" &&
          field.selectableValues &&
          typeof value === "string"
        ) {
          const selectedOption = field.selectableValues.find(
            (opt) => opt.value === value
          );
          lines.push(selectedOption ? selectedOption.label : String(value));
        } else if (typeof value === "object") {
          lines.push(JSON.stringify(value, null, 2));
        } else {
          lines.push(String(value));
        }

        lines.push("");
      }
    }
  }

  return lines.join("\n");
}
