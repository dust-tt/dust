import sanitizeHtml from "sanitize-html";

import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AshbyClient } from "@app/lib/api/actions/servers/ashby/client";
import { getAshbyClient } from "@app/lib/api/actions/servers/ashby/client";
import {
  assertCandidateNotHired,
  findUniqueCandidate,
} from "@app/lib/api/actions/servers/ashby/helpers";
import { ASHBY_TOOLS_METADATA } from "@app/lib/api/actions/servers/ashby/metadata";
import {
  renderCandidateList,
  renderCandidateNotes,
  renderInterviewFeedbackRecap,
  renderReferralForm,
  renderReportInfo,
} from "@app/lib/api/actions/servers/ashby/rendering";
import type { AshbyFeedbackSubmission } from "@app/lib/api/actions/servers/ashby/types";
import { toCsv } from "@app/lib/api/csv";
import { Err, isString, Ok } from "@app/types";

const JOB_FIELD_PATH = "_systemfield.job";
const DEFAULT_SEARCH_LIMIT = 20;

function normalizeTitle(title: string): string {
  return title
    .replace(/[*_~`#]/g, "")
    .toLowerCase()
    .trim();
}

const handlers: ToolHandlers<typeof ASHBY_TOOLS_METADATA> = {
  search_candidates: async ({ email, name }, extra) => {
    if (!email && !name) {
      return new Err(
        new MCPError(
          "At least one search parameter (email or name) must be provided.",
          {
            tracked: false,
          }
        )
      );
    }

    const clientResult = await getAshbyClient(extra);
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;
    const result = await client.searchCandidates({ email, name });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to search candidates: ${result.error.message}`)
      );
    }

    const response = result.value;

    if (response.results.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: "No candidates found matching the search criteria.",
        },
      ]);
    }

    const candidatesText = renderCandidateList(response.results);
    const searchParams = [
      email ? `email: ${email}` : null,
      name ? `name: ${name}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const resultText = `Found ${response.results.length} candidate(s) matching search (${searchParams}):\n\n${candidatesText}`;

    if (response.results.length === DEFAULT_SEARCH_LIMIT) {
      return new Ok([
        {
          type: "text" as const,
          text:
            resultText +
            `\n\nNote: Results are limited to ${DEFAULT_SEARCH_LIMIT} candidates. ` +
            "Consider refining your search if you need more specific results.",
        },
      ]);
    }

    return new Ok([
      {
        type: "text" as const,
        text: resultText,
      },
    ]);
  },

  get_report_data: async ({ reportUrl }, extra) => {
    const clientResult = await getAshbyClient(extra);
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    // Parse the report ID from the URL
    // Expected format: https://app.ashbyhq.com/reports/.../[reportId]
    if (!reportUrl.startsWith("https://app.ashbyhq.com/reports/")) {
      return new Err(
        new MCPError(
          "Invalid Ashby report URL. Expected format: https://app.ashbyhq.com/reports/.../[reportId]"
        )
      );
    }

    const reportId = reportUrl.split("/").pop();
    if (!reportId) {
      return new Err(
        new MCPError(
          "Invalid Ashby report URL. Expected format: https://app.ashbyhq.com/reports/.../[reportId]"
        )
      );
    }

    const result = await client.getReportData({ reportId });

    if (result.isErr()) {
      return new Err(
        new MCPError(`Failed to retrieve report data: ${result.error.message}`)
      );
    }

    const response = result.value;

    if (!response.success) {
      return new Err(
        new MCPError(
          `Report retrieval failed: ${response.results.failureReason ?? "Unknown error"}`
        )
      );
    }

    const reportData = response.results.reportData;

    if (reportData.data.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: `Report ${reportId} returned no data.`,
        },
      ]);
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

    return new Ok([
      {
        type: "text" as const,
        text: renderReportInfo(response, reportId),
      },
      {
        type: "resource" as const,
        resource: {
          uri: `ashby-report-${reportId}.csv`,
          mimeType: "text/csv",
          blob: base64Content,
          text: `Ashby report data (${dataRows.length} rows)`,
        },
      },
    ]);
  },

  get_interview_feedback: async ({ email, name }, extra) => {
    const clientResult = await getAshbyClient(extra);
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    const candidateResult = await findUniqueCandidate(client, {
      email,
      name,
    });
    if (candidateResult.isErr()) {
      return new Err(candidateResult.error);
    }

    const candidate = candidateResult.value;

    if (!candidate.applicationIds || candidate.applicationIds.length === 0) {
      return new Err(
        new MCPError(
          `Candidate ${candidate.name} ` +
            (candidate.primaryEmailAddress?.value
              ? `(${candidate.primaryEmailAddress?.value}) `
              : "") +
            "has no applications in the system.",
          {
            tracked: false,
          }
        )
      );
    }

    const hiredCheckResult = await assertCandidateNotHired(client, candidate);
    if (hiredCheckResult.isErr()) {
      return hiredCheckResult;
    }

    let latestApplicationFeedback: AshbyFeedbackSubmission[] | null = null;
    let latestApplicationDate: Date | null = null;

    for (const applicationId of candidate.applicationIds) {
      const feedbackResult = await client.listApplicationFeedback({
        applicationId,
      });

      if (feedbackResult.isErr()) {
        continue;
      }

      // We consider the max date across all feedback for the application.
      for (const feedback of feedbackResult.value) {
        if (!feedback.submittedAt) {
          continue;
        }
        const submittedAt = new Date(feedback.submittedAt);
        if (!latestApplicationDate || submittedAt > latestApplicationDate) {
          latestApplicationDate = submittedAt;
          latestApplicationFeedback = feedbackResult.value;
        }
      }
    }

    if (!latestApplicationFeedback || latestApplicationFeedback.length === 0) {
      return new Err(
        new MCPError(
          `No submitted interview feedback found for candidate ${candidate.name}.`,
          {
            tracked: false,
          }
        )
      );
    }

    const recapText = renderInterviewFeedbackRecap(
      candidate,
      latestApplicationFeedback
    );

    return new Ok([
      {
        type: "text" as const,
        text: recapText,
      },
    ]);
  },

  get_candidate_notes: async ({ email, name }, extra) => {
    const clientResult = await getAshbyClient(extra);
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    const candidateResult = await findUniqueCandidate(client, {
      email,
      name,
    });

    if (candidateResult.isErr()) {
      return new Err(candidateResult.error);
    }

    const candidate = candidateResult.value;

    const hiredCheckResult = await assertCandidateNotHired(client, candidate);
    if (hiredCheckResult.isErr()) {
      return hiredCheckResult;
    }

    const notesResult = await client.listCandidateNotes({
      candidateId: candidate.id,
    });

    if (notesResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to retrieve notes for candidate: ${notesResult.error.message}`
        )
      );
    }

    const notes = notesResult.value;

    if (notes.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text:
            `No notes found for candidate ${candidate.name}` +
            (candidate.primaryEmailAddress?.value
              ? ` (${candidate.primaryEmailAddress.value})`
              : "") +
            ".",
        },
      ]);
    }

    const notesText = renderCandidateNotes(candidate, notes);

    return new Ok([
      {
        type: "text" as const,
        text: notesText,
      },
    ]);
  },

  create_candidate_note: async ({ email, name, noteContent }, extra) => {
    const clientResult = await getAshbyClient(extra);
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client: AshbyClient = clientResult.value;

    const candidateResult = await findUniqueCandidate(client, {
      email,
      name,
    });

    if (candidateResult.isErr()) {
      return new Err(candidateResult.error);
    }

    const candidate = candidateResult.value;

    const noteResult = await client.createCandidateNote({
      candidateId: candidate.id,
      note: {
        type: "text/html",
        value: sanitizeHtml(noteContent),
      },
    });

    if (noteResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to create note on candidate: ${noteResult.error.message}`
        )
      );
    }

    if (!noteResult.value.success) {
      return new Err(
        new MCPError("Failed to create note on candidate profile.")
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text:
          `Successfully created note on candidate ${candidate.name}'s ` +
          (candidate.primaryEmailAddress?.value
            ? `(${candidate.primaryEmailAddress?.value}) `
            : "") +
          `profile.\n\nNote ID: ${noteResult.value.results.id}`,
      },
    ]);
  },

  create_referral: async ({ fieldSubmissions }, extra) => {
    const clientResult = await getAshbyClient(extra);
    if (clientResult.isErr()) {
      return clientResult;
    }

    const client = clientResult.value;

    const auth = extra.auth;
    if (!auth) {
      return new Err(
        new MCPError("Authentication context not available.", {
          tracked: false,
        })
      );
    }

    const user = auth.user();
    if (!user) {
      return new Err(
        new MCPError(
          "No authenticated user found. " +
            "A user is required to credit the referral to the correct person.",
          { tracked: false }
        )
      );
    }

    // Resolve the Ashby user from the authenticated Dust user's email.
    const ashbyUserResult = await client.searchUser({ email: user.email });
    if (ashbyUserResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to find Ashby user for email ${user.email}: ${ashbyUserResult.error.message}`
        )
      );
    }

    const ashbyUsers = ashbyUserResult.value.results;
    if (ashbyUsers.length === 0) {
      return new Err(
        new MCPError(
          `No Ashby user found for email ${user.email}. ` +
            "The referral must be credited to a valid Ashby user.",
          { tracked: false }
        )
      );
    }

    const ashbyUser = ashbyUsers[0];

    // Fetch the referral form to get its ID.
    const formResult = await client.getReferralFormInfo();
    if (formResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to retrieve referral form: ${formResult.error.message}`
        )
      );
    }

    if (!formResult.value.success) {
      return new Err(
        new MCPError("Failed to retrieve referral form from Ashby.")
      );
    }

    const form = formResult.value.results;

    // Build a title -> path map from the form definition.
    const titleToPath = new Map<string, string>();
    for (const section of form.formDefinition?.sections ?? []) {
      for (const fieldWrapper of section.fields) {
        titleToPath.set(
          normalizeTitle(fieldWrapper.field.title),
          fieldWrapper.field.path
        );
      }
    }

    // Map user-provided titles to API paths. When the form has fields,
    // validate titles against them. Otherwise, pass titles through as
    // paths directly (best-effort) and let the API validate.
    let resolvedSubmissions: {
      path: string;
      value: string | number | boolean;
    }[];

    if (titleToPath.size > 0) {
      const unmatchedTitles: string[] = [];
      resolvedSubmissions = [];

      for (const submission of fieldSubmissions) {
        const path = titleToPath.get(normalizeTitle(submission.title));
        if (!path) {
          unmatchedTitles.push(submission.title);
        } else {
          resolvedSubmissions.push({ path, value: submission.value });
        }
      }

      if (unmatchedTitles.length > 0) {
        const formDefinition = renderReferralForm(form);
        return new Err(
          new MCPError(
            `The following field titles don't match any form fields: ` +
              `${unmatchedTitles.join(", ")}.\n\n` +
              `Here is the referral form definition with the available ` +
              `field titles:\n\n${formDefinition}`,
            { tracked: false }
          )
        );
      }

      // Resolve the job field: if the value is a name, look up its UUID.
      const jobSubmission = resolvedSubmissions.find(
        (s) => s.path === JOB_FIELD_PATH
      );

      if (jobSubmission && isString(jobSubmission.value)) {
        const jobsResult = await client.listJobs();
        if (jobsResult.isErr()) {
          return new Err(
            new MCPError(`Failed to list jobs: ${jobsResult.error.message}`)
          );
        }

        const jobsByName = new Map(
          jobsResult.value.map((j) => [j.title.toLowerCase().trim(), j.id])
        );

        const normalizedJobName = jobSubmission.value.toLowerCase().trim();
        const jobId = jobsByName.get(normalizedJobName);
        if (!jobId) {
          const availableJobs = jobsResult.value
            .map((j) => `- ${j.title} (${j.status})`)
            .join("\n");
          return new Err(
            new MCPError(
              `Could not find a job matching "${jobSubmission.value}".\n\n` +
                `Available jobs:\n${availableJobs}`,
              { tracked: false }
            )
          );
        }
        jobSubmission.value = jobId;
      }

      // Check that all required fields are present.
      const submittedPaths = new Set(resolvedSubmissions.map((s) => s.path));
      const missingFields: string[] = [];
      for (const section of form.formDefinition?.sections ?? []) {
        for (const fieldWrapper of section.fields) {
          if (
            fieldWrapper.isRequired &&
            !submittedPaths.has(fieldWrapper.field.path)
          ) {
            missingFields.push(fieldWrapper.field.title.trim());
          }
        }
      }

      if (missingFields.length > 0) {
        const formDefinition = renderReferralForm(form);
        return new Err(
          new MCPError(
            `Missing required fields: ${missingFields.join(", ")}.\n\n` +
              `Here is the referral form definition:\n\n${formDefinition}`,
            { tracked: false }
          )
        );
      }
    } else {
      resolvedSubmissions = fieldSubmissions.map((s) => ({
        path: s.title,
        value: s.value,
      }));
    }

    const createRequest = {
      referralFormId: form.id,
      creditedToUserId: ashbyUser.id,
      fieldSubmissions: resolvedSubmissions,
    };

    const referralResult = await client.createReferral(createRequest);

    if (referralResult.isErr()) {
      const formDefinition = renderReferralForm(form);
      return new Err(
        new MCPError(
          `Failed to create referral: ${referralResult.error.message}\n\n` +
            `Here is the referral form definition to help you retry ` +
            `with the correct fields:\n\n${formDefinition}`,
          { cause: referralResult.error }
        )
      );
    }

    if (!referralResult.value.success || !referralResult.value.results) {
      const formDefinition = renderReferralForm(form);
      const errorMessage =
        referralResult.value.errorInfo?.message ??
        referralResult.value.errors?.join(", ") ??
        "Unknown error";
      return new Err(
        new MCPError(
          `Failed to create referral: ${errorMessage}` +
            `\n\nHere is the referral form definition to help you retry ` +
            `with the correct fields:\n\n${formDefinition}`
        )
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text:
          `Successfully created referral.\n\n` +
          `Credited to: ${ashbyUser.firstName} ${ashbyUser.lastName} (${ashbyUser.email})\n` +
          `Referral ID: ${referralResult.value.results.id}\n` +
          `Status: ${referralResult.value.results.status}`,
      },
    ]);
  },
};

export const TOOLS = buildTools(ASHBY_TOOLS_METADATA, handlers);
