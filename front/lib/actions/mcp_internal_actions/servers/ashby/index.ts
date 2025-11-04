import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  AshbyClient,
  getAshbyApiKey,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/client";
import { renderCandidateList } from "@app/lib/actions/mcp_internal_actions/servers/ashby/rendering";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { toCsv } from "@app/lib/api/csv";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ashby");

  server.tool(
    "search_candidates",
    "Search for candidates in Ashby ATS by name and/or email. " +
      "Returns up to 100 matching candidates.",
    {
      email: z
        .string()
        .optional()
        .describe("Email address to search for (partial matches supported)."),
      name: z
        .string()
        .optional()
        .describe("Name to search for (partial matches supported)."),
    },
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

        if (response.results.length === 100) {
          return new Ok([
            {
              type: "text" as const,
              text:
                resultText +
                "\n\nNote: Results are limited to 100 candidates. " +
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
      reportId: z
        .string()
        .uuid()
        .describe("UUID of the report to retrieve data from."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "ashby_get_report_data", agentLoopContext },
      async ({ reportId }) => {
        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
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

        if (response.data.length === 0) {
          return new Ok([
            {
              type: "text" as const,
              text: `Report ${reportId} returned no data.`,
            },
          ]);
        }

        const fieldNames = response.fields.map((f) => f.name);
        const csvRows = response.data.map((row) => {
          const csvRow: Record<string, string> = {};
          for (const fieldName of fieldNames) {
            const value = row[fieldName];
            csvRow[fieldName] =
              value === null || value === undefined ? "" : String(value);
          }
          return csvRow;
        });

        const csvContent = await toCsv(csvRows);
        const base64Content = Buffer.from(csvContent).toString("base64");

        const resultText =
          `Report data retrieved successfully!\n\nReport ID: ${reportId}\n` +
          `Rows: ${response.data.length}\nFields: ${fieldNames.join(", ")}\n\n` +
          "The data has been saved as a CSV file.";

        return new Ok([
          {
            type: "text" as const,
            text: resultText,
          },
          {
            type: "resource" as const,
            resource: {
              uri: `ashby-report-${reportId}.csv`,
              mimeType: "text/csv",
              blob: base64Content,
              text: `Ashby report data (${response.data.length} rows)`,
            },
          },
        ]);
      }
    )
  );

  server.tool(
    "submit_feedback",
    "Submit feedback for a candidate application in Ashby ATS. Searches for the " +
      "candidate by name and/or email, then submits feedback for their application. " +
      "Returns an error if no candidate or multiple candidates are found.",
    {
      email: z
        .string()
        .optional()
        .describe("Email address of the candidate to search for."),
      name: z
        .string()
        .optional()
        .describe("Name of the candidate to search for."),
      feedbackFormDefinitionId: z
        .string()
        .uuid()
        .describe("UUID of the feedback form definition to use."),
      feedbackForm: z
        .record(z.unknown())
        .describe(
          "Object mapping feedback field paths to their values. Value formats depend " +
            "on field types: Boolean (boolean), Date (YYYY-MM-DD string), Email (email string), " +
            "Number (integer), RichText ({type: 'PlainText', value: string}), Score " +
            "({score: 1-4}), Phone/String (string), ValueSelect (string option), " +
            "MultiValueSelect (array of strings)."
        ),
      userId: z
        .string()
        .uuid()
        .optional()
        .describe("UUID of the user submitting the feedback (optional)."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "ashby_create_feedback", agentLoopContext },
      async ({
        email,
        name,
        feedbackFormDefinitionId,
        feedbackForm,
        userId,
      }) => {
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
              `Failed to search for candidate: ${searchResult.error.message}`
            )
          );
        }

        const candidates = searchResult.value.results;

        if (candidates.length === 0) {
          const searchParams = [
            email ? `email: ${email}` : null,
            name ? `name: ${name}` : null,
          ]
            .filter(Boolean)
            .join(", ");
          return new Err(
            new MCPError(
              `No candidate found matching search criteria (${searchParams}).`
            )
          );
        }

        if (candidates.length > 1) {
          const candidateList = candidates
            .map((c) => `- ${c.name} (${c.id})`)
            .join("\n");
          return new Err(
            new MCPError(
              `Multiple candidates found (${candidates.length}). ` +
                `Please provide more specific search criteria.\n\nFound candidates:\n${candidateList}`
            )
          );
        }

        const candidate = candidates[0];
        const candidateInfoResult = await client.getCandidateInfo({
          candidateId: candidate.id,
        });

        if (candidateInfoResult.isErr()) {
          return new Err(
            new MCPError(
              `Failed to get candidate details: ${candidateInfoResult.error.message}`
            )
          );
        }

        const candidateInfo = candidateInfoResult.value;

        if (
          !candidateInfo.applicationIds ||
          candidateInfo.applicationIds.length === 0
        ) {
          return new Err(
            new MCPError(
              `Candidate ${candidateInfo.name} (${candidateInfo.id}) has no applications.`
            )
          );
        }

        const applicationInfo = await concurrentExecutor(
          candidateInfo.applicationIds,
          async (appId) => client.getApplicationInfo({ applicationId: appId }),
          { concurrency: 10 }
        );

        const activeApplications = [];
        for (const appResult of applicationInfo) {
          if (appResult.isOk() && !appResult.value.archiveReason) {
            activeApplications.push(appResult.value);
          }
        }

        if (activeApplications.length === 0) {
          return new Err(
            new MCPError(
              `Candidate ${candidateInfo.name} (${candidateInfo.id}) has no active applications.`
            )
          );
        }

        if (activeApplications.length > 1) {
          return new Err(
            new MCPError(
              `Candidate ${candidateInfo.name} (${candidateInfo.id}) has multiple ` +
                `active applications (${activeApplications.length}). Could not determine which ` +
                "one to submit the feedback for."
            )
          );
        }

        const applicationId = activeApplications[0].id;

        const result = await client.submitFeedback({
          applicationId,
          feedbackFormDefinitionId,
          feedbackForm,
          userId,
        });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to submit feedback: ${result.error.message}`)
          );
        }

        const response = result.value;
        const submittedFields = Object.entries(response.submittedValues)
          .map(([field, value]) => {
            return `  ${field}: ${JSON.stringify(value)}`;
          })
          .join("\n");

        const resultText =
          `Feedback submitted successfully!\n\nCandidate: ${candidateInfo.name} ` +
          `(${candidateInfo.id})\nApplication ID: ${applicationId}\nFeedback Form: ` +
          `${feedbackFormDefinitionId}\n\nSubmitted values:\n${submittedFields}`;

        return new Ok([
          {
            type: "text" as const,
            text: resultText,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
