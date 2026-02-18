// biome-ignore lint/suspicious/noImportCycles: ignored using `--suppress`
import { JOB_FIELD_PATH } from "@app/lib/api/actions/servers/ashby/helpers";
import type {
  AshbyCandidate,
  AshbyCandidateNote,
  AshbyFeedbackSubmission,
  AshbyJob,
  AshbyReferralFormInfo,
  AshbyReportSynchronousResponse,
} from "@app/lib/api/actions/servers/ashby/types";
import { toCsv } from "@app/lib/api/csv";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

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

export async function renderReport(
  responseResults: NonNullable<AshbyReportSynchronousResponse["results"]>,
  { reportId }: { reportId: string }
): Promise<CallToolResult["content"]> {
  const { reportData, status } = responseResults;

  if (status !== "complete") {
    return [
      {
        type: "text" as const,
        text: `Generation of report ${reportId} is not complete (status: ${status}).`,
      },
    ];
  }

  if (reportData.data.length === 0) {
    return [
      {
        type: "text" as const,
        text: `Report ${reportId} returned no data.`,
      },
    ];
  }

  const {
    columnNames,
    data: [_headerRow, ...dataRows],
  } = reportData;

  const csvRows = dataRows.map((row) => {
    const csvRow: Record<string, string> = {};
    columnNames.forEach((fieldName, index) => {
      const value = row[index];
      csvRow[fieldName] =
        value === null || value === undefined ? "" : String(value);
    });
    return csvRow;
  });

  const csvContent = await toCsv(csvRows);
  const base64Content = Buffer.from(csvContent).toString("base64");

  return [
    {
      type: "text" as const,
      text:
        `Report data retrieved successfully!\n\n` +
        `Report ID: ${reportId}\n` +
        `Title: ${reportData.metadata.title}\n` +
        `Updated: ${reportData.metadata.updatedAt}\n` +
        `Rows: ${dataRows.length}\n` +
        `Fields: ${reportData.columnNames.join(", ")}\n\n` +
        "The data has been saved as a CSV file.",
    },
    {
      type: "resource" as const,
      resource: {
        uri: `ashby-report-${reportId}.csv`,
        mimeType: "text/csv",
        blob: base64Content,
        _meta: { text: `Ashby report data (${dataRows.length} rows)` },
      },
    },
  ];
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

function renderSingleNote(note: AshbyCandidateNote): string {
  const lines: string[] = [];

  if (note.author) {
    lines.push(
      `**Author:** ${note.author.firstName} ${note.author.lastName} (${note.author.email})`
    );
  }

  lines.push(`**Created at:** ${new Date(note.createdAt).toISOString()}`);
  lines.push("");
  lines.push(note.content);

  return lines.join("\n");
}

export function renderCandidateNotes(
  candidate: AshbyCandidate,
  notes: AshbyCandidateNote[]
): string {
  const delimiterLine = "=".repeat(80);

  const header = [
    "# Candidate Notes",
    "",
    `**Candidate:** ${candidate.name}`,
    "",
    `**Total Notes:** ${notes.length}`,
    "",
    delimiterLine,
    "",
  ];
  const noteTexts = notes.map((note) => renderSingleNote(note));

  return header.join("\n") + noteTexts.join(`\n\n${delimiterLine}\n\n`);
}

export function renderReferralForm(
  form: AshbyReferralFormInfo,
  {
    jobs,
  }: {
    jobs: AshbyJob[];
  }
): string {
  const lines: string[] = ["# Referral Form", "", `**Title:** ${form.title}`];

  if (form.description) {
    lines.push(`**Description:** ${form.description}`);
  }

  lines.push("");

  for (const section of form.formDefinition?.sections ?? []) {
    if (section.title) {
      lines.push(`## ${section.title}`);
      lines.push("");
    }

    for (const fieldWrapper of section.fields) {
      const {
        field: { title, path, type, selectableValues },
        isRequired,
      } = fieldWrapper;

      lines.push(`- **${title}**${isRequired ? " (required)" : " (optional)"}`);

      // Handle the job field as a special case: we need to pass the UUID of the job when creating
      // a referral, but we ask the model to pass the name (easier for the model) and convert it.
      if (path === JOB_FIELD_PATH) {
        lines.push(`  - Type: Job name (will be resolved automatically)`);
        lines.push("  - Available jobs:");
        for (const job of jobs) {
          lines.push(`    - ${job.title} (${job.status})`);
        }
      } else {
        lines.push(`  - Type: ${type}`);

        if (selectableValues && selectableValues.length > 0) {
          lines.push("  - Options:");
          for (const opt of selectableValues) {
            lines.push(`    - \`${opt.value}\`: ${opt.label}`);
          }
        }
      }

      lines.push("");
    }
  }

  return lines.join("\n");
}
