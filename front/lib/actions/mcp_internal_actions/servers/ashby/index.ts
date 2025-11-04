import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  AshbyClient,
  getAshbyApiKey,
} from "@app/lib/actions/mcp_internal_actions/servers/ashby/client";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { toCsv } from "@app/lib/api/csv";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ashby");

  server.tool(
    "search_candidates",
    "Search for candidates in Ashby ATS by name and/or email. Returns up to 100 matching candidates. Use this when you need to find specific candidates.",
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

        const candidatesText = response.results
          .map((candidate) => {
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
              lines.push(
                `Created: ${new Date(candidate.createdAt).toISOString()}`
              );
            }

            return lines.join("\n");
          })
          .join("\n\n---\n\n");

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
                "\n\nNote: Results are limited to 100 candidates. Consider refining your search if you need more specific results.",
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
    "list_candidates",
    "List all candidates from Ashby ATS. Returns candidate information including name, email, phone, and creation date.",
    {
      cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor from a previous response to get the next page of results."
        ),
      limit: z
        .number()
        .min(1)
        .max(250)
        .optional()
        .describe(
          "Maximum number of candidates to return (default: 100, max: 250)."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "ashby_list_candidates", agentLoopContext },
      async ({ cursor, limit }) => {
        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
        }

        const client = new AshbyClient(apiKeyResult.value);
        const result = await client.listCandidates({ cursor, limit });

        if (result.isErr()) {
          return new Err(
            new MCPError(`Failed to list candidates: ${result.error.message}`)
          );
        }

        const response = result.value;
        const candidatesText = response.results
          .map((candidate) => {
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
              lines.push(
                `Created: ${new Date(candidate.createdAt).toISOString()}`
              );
            }

            return lines.join("\n");
          })
          .join("\n\n---\n\n");

        let resultText = `Found ${response.results.length} candidate(s):\n\n${candidatesText}`;

        if (response.nextCursor) {
          resultText += `\n\nMore results available. Use cursor: ${response.nextCursor}`;
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
    "Retrieve report data from Ashby ATS synchronously and save as a CSV file. Maximum 30 second timeout. For longer-running reports, consider using smaller date ranges or filters.",
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

        const resultText = `Report data retrieved successfully!\n\nReport ID: ${reportId}\nRows: ${response.data.length}\nFields: ${fieldNames.join(", ")}\n\nThe data has been saved as a CSV file.`;

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
    "Submit feedback for a candidate application in Ashby ATS. Requires applicationId, feedbackFormDefinitionId, and values object containing feedback data.",
    {
      applicationId: z
        .string()
        .uuid()
        .describe("UUID of the application to submit feedback for."),
      feedbackFormDefinitionId: z
        .string()
        .uuid()
        .describe("UUID of the feedback form definition to use."),
      values: z
        .record(z.unknown())
        .describe(
          "Object mapping feedback field paths to their values. Value formats depend on field types: Boolean (boolean), Date (YYYY-MM-DD string), Email (email string), Number (integer), RichText ({type: 'PlainText', value: string}), Score ({score: 1-4}), Phone/String (string), ValueSelect (string option), MultiValueSelect (array of strings)."
        ),
      userId: z
        .string()
        .uuid()
        .optional()
        .describe("UUID of the user submitting the feedback (optional)."),
      interviewEventId: z
        .string()
        .uuid()
        .optional()
        .describe(
          "UUID of the interview event this feedback is associated with (optional)."
        ),
      authorId: z
        .string()
        .uuid()
        .optional()
        .describe("UUID of the author submitting the feedback (optional)."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "ashby_create_feedback", agentLoopContext },
      async ({
        applicationId,
        feedbackFormDefinitionId,
        values,
        userId,
        interviewEventId,
        authorId,
      }) => {
        const apiKeyResult = await getAshbyApiKey(auth, agentLoopContext);
        if (apiKeyResult.isErr()) {
          return new Err(apiKeyResult.error);
        }

        const client = new AshbyClient(apiKeyResult.value);
        const result = await client.submitFeedback({
          applicationId,
          feedbackFormDefinitionId,
          values,
          userId,
          interviewEventId,
          authorId,
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

        const resultText = `Feedback submitted successfully!\n\nApplication ID: ${applicationId}\nFeedback Form: ${feedbackFormDefinitionId}\n\nSubmitted values:\n${submittedFields}`;

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
