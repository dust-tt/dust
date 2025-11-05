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
import { Err, Ok } from "@app/types";

const DEFAULT_SEARCH_LIMIT = 20;

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ashby");

  server.tool(
    "search_candidates",
    "Search for candidates in Ashby ATS by name and/or email. " +
      `Returns up to ${DEFAULT_SEARCH_LIMIT} matching candidates by default.`,
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
    "Retrieve report data from Ashby ATS synchronously and save as a CSV file. " +
      "Provide the full Ashby report URL (e.g., https://app.ashbyhq.com/reports/saved/[reportId]).",
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
        // Extract the ID from the last part of the path
        const urlPattern =
          /https:\/\/app\.ashbyhq\.com\/reports\/.*\/([^/]+)\/?$/;
        const match = reportUrl.match(urlPattern);

        if (!match?.[1]) {
          return new Err(
            new MCPError(
              `Invalid Ashby report URL. Expected format: https://app.ashbyhq.com/reports/.../[reportId]`
            )
          );
        }

        const reportId = match[1];

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

        const fieldNames = reportData.columnNames;
        const [_, ...dataRows] = reportData.data;

        const csvRows = dataRows.map((row) => {
          const csvRow: Record<string, string> = {};
          fieldNames.forEach((fieldName, index) => {
            const value = row[index];
            csvRow[fieldName] =
              value === null || value === undefined ? "" : String(value);
          });
          return csvRow;
        });

        const csvContent = await toCsv(csvRows);
        const base64Content = Buffer.from(csvContent).toString("base64");

        const resultText =
          `Report data retrieved successfully!\n\n` +
          `Report ID: ${reportId}\n` +
          `Title: ${reportData.metadata.title}\n` +
          `Updated: ${reportData.metadata.updatedAt}\n` +
          `Rows: ${dataRows.length}\n` +
          `Fields: ${fieldNames.join(", ")}\n\n` +
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
              text: `Ashby report data (${dataRows.length} rows)`,
            },
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
