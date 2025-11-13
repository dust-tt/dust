import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  AshbyClient,
  getAshbyApiKey,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/client";
import {
  renderCandidateList,
  renderInterviewFeedbackRecap,
  renderReportInfo,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { toCsv } from "@app/lib/api/csv";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

const DEFAULT_SEARCH_LIMIT = 20;

const CandidateSearchInputSchema = z.object({
  email: z
    .string()
    .optional()
    .describe("Email address to search for (partial matches supported)."),
  name: z
    .string()
    .optional()
    .describe("Name to search for (partial matches supported)."),
});

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ashby");

  server.tool(
    "search_candidates",
    "Search for candidates in Ashby ATS by name and/or email. " +
      `Returns up to ${DEFAULT_SEARCH_LIMIT} matching candidates by default.`,
    CandidateSearchInputSchema.shape,
    withToolLogging(
      auth,
      { toolNameForMonitoring: "ashby_search_candidates", agentLoopContext },
      async ({ email, name }) => {
        if (!email && !name) {
          return new Err(
            new MCPError(
              "At least one search parameter (email or name) must be provided."
            )
          );
        }

        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
        }

        const client = new AshbyClient(apiKeyResult.value);
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
      }
    )
  );

  server.tool(
    "get_report_data",
    "Retrieve report data from Ashby ATS synchronously and save as a CSV file.",
    {
      reportUrl: z
        .string()
        .describe(
          "Full URL of the Ashby report (e.g., https://app.ashbyhq.com/reports/saved/[reportId])."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "ashby_get_report_data", agentLoopContext },
      async ({ reportUrl }) => {
        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
        }

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

        const client = new AshbyClient(apiKeyResult.value);
        const result = await client.getReportData({ reportId });

        if (result.isErr()) {
          return new Err(
            new MCPError(
              `Failed to retrieve report data: ${result.error.message}`
            )
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
      }
    )
  );

  server.tool(
    "get_interview_feedback",
    "Retrieve all interview feedback for a candidate. " +
      "This tool will search for the candidate by name or email and return all submitted " +
      "interview feedback, sorted by most recent first.",
    CandidateSearchInputSchema.shape,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "ashby_get_latest_interview_feedback",
        agentLoopContext,
      },
      async ({ email, name }) => {
        if (!email && !name) {
          return new Err(
            new MCPError(
              "At least one search parameter (email or name) must be provided."
            )
          );
        }

        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
        }

        const client = new AshbyClient(apiKeyResult.value);

        const searchResult = await client.searchCandidates({ email, name });
        if (searchResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to search candidates: ${searchResult.error.message}`
            )
          );
        }

        const candidates = searchResult.value.results;
        if (candidates.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No candidates found matching the search criteria.",
            },
          ]);
        }

        if (candidates.length > 1) {
          const candidatesList = candidates
            .map(
              (c, i) =>
                `${i + 1}. ${c.name} (${c.primaryEmailAddress?.value ?? "no email"})`
            )
            .join("\n");
          return new Err(
            new MCPError(
              `Multiple candidates found. Please refine your search:\n\n${candidatesList}`
            )
          );
        }

        const candidate = candidates[0];

        if (
          !candidate.applicationIds ||
          candidate.applicationIds.length === 0
        ) {
          return new Err(
            new MCPError(
              `Candidate ${candidate.name} ` +
                (candidate.primaryEmailAddress?.value
                  ? `(${candidate.primaryEmailAddress?.value}) `
                  : "") +
                "has no applications in the system."
            )
          );
        }

        const allFeedback = [];

        for (const applicationId of candidate.applicationIds) {
          const feedbackResult = await client.getApplicationFeedback({
            applicationId,
          });

          if (feedbackResult.isErr()) {
            continue;
          }

          allFeedback.push(...feedbackResult.value.results);
        }

        if (allFeedback.length === 0) {
          return new Err(
            new MCPError(
              `No submitted interview feedback found for candidate ${candidate.name}.`
            )
          );
        }

        allFeedback.sort((a, b) => {
          const dateA = new Date(a.submittedAt!);
          const dateB = new Date(b.submittedAt!);
          return dateB.getTime() - dateA.getTime();
        });

        const recapText = renderInterviewFeedbackRecap(candidate, allFeedback);

        return new Ok([
          {
            type: "text" as const,
            text: recapText,
          },
        ]);
      }
    )
  );

  server.tool(
    "create_candidate_note",
    "Create a note on a candidate's profile in Ashby. " +
      "The note content can include basic HTML formatting (supported tags: h1-h6, p, b, i, u, a, ul, ol, li, code, pre).",
    {
      ...CandidateSearchInputSchema.shape,
      noteContent: z
        .string()
        .describe("The content of the note in HTML format."),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "ashby_create_candidate_note",
        agentLoopContext,
      },
      async ({ email, name, noteContent }) => {
        if (!email && !name) {
          return new Err(
            new MCPError(
              "At least one search parameter (email or name) must be provided."
            )
          );
        }

        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
        }

        const client = new AshbyClient(apiKeyResult.value);

        const searchResult = await client.searchCandidates({ email, name });
        if (searchResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to search candidates: ${searchResult.error.message}`
            )
          );
        }

        const candidates = searchResult.value.results;
        if (candidates.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: "No candidates found matching the search criteria.",
            },
          ]);
        }

        if (candidates.length > 1) {
          const candidatesList = candidates
            .map(
              (c, i) =>
                `${i + 1}. ${c.name} (${c.primaryEmailAddress?.value ?? "no email"})`
            )
            .join("\n");
          return new Err(
            new MCPError(
              `Multiple candidates found. Please refine your search:\n\n${candidatesList}`
            )
          );
        }

        const candidate = candidates[0];

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
      }
    )
  );

  return server;
}

export default createServer;
