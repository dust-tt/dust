import type {
  AshbyCandidate,
  AshbyFeedbackSubmission,
  AshbyReportSynchronousResponse,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/types";

function renderCandidate(candidate: AshbyCandidate): string {
  const lines = [`ID: ${candidate.id}`, `Name: ${candidate.name}`];

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

function renderSingleFeedback(feedback: AshbyFeedbackSubmission): string {
  const lines: string[] = [];

  if (feedback.submittedByUser) {
    lines.push(
      `**Submitted by:** ${feedback.submittedByUser.firstName} ${feedback.submittedByUser.lastName} (${feedback.submittedByUser.email})`
    );
  }

  if (feedback.submittedAt) {
    lines.push(
      `**Submitted at:** ${new Date(feedback.submittedAt).toISOString()}`
    );
  }

  lines.push("");

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

export function renderInterviewFeedbackRecap(
  candidate: AshbyCandidate,
  allFeedback: AshbyFeedbackSubmission[]
): string {
  const delimiterLine = "=".repeat(80);

  const header = [
    "# Interview Feedback Summary",
    "",
    `**Candidate:** ${candidate.name}`,
  ];

  header.push(
    "",
    `**Total Feedback:** ${allFeedback.length}`,
    "",
    delimiterLine,
    ""
  );

  const feedbackTexts = allFeedback.map((feedback) =>
    renderSingleFeedback(feedback)
  );

  return header.join("\n") + feedbackTexts.join(`\n\n${delimiterLine}\n\n`);
}
