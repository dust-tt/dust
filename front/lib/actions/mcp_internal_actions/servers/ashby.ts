import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { toCsv } from "@app/lib/api/csv";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecret } from "@app/lib/models/dust_app_secret";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { decrypt, Err, normalizeError, Ok } from "@app/types";

const ASHBY_API_BASE_URL = "https://api.ashbyhq.com";

const AshbyCandidateSchema = z.object({
  id: z.string(),
  name: z.string(),
  primaryEmailAddress: z
    .object({
      value: z.string(),
      type: z.string(),
    })
    .optional(),
  phoneNumbers: z
    .array(
      z.object({
        value: z.string(),
        type: z.string(),
      })
    )
    .optional(),
  socialLinks: z
    .array(
      z.object({
        value: z.string(),
        type: z.string(),
      })
    )
    .optional(),
  createdAt: z.string(),
});

type AshbyCandidate = z.infer<typeof AshbyCandidateSchema>;

const AshbyCandidateListResponseSchema = z.object({
  results: z.array(AshbyCandidateSchema),
  nextCursor: z.string().optional(),
});

type AshbyCandidateListResponse = z.infer<
  typeof AshbyCandidateListResponseSchema
>;

const AshbyFeedbackSubmitRequestSchema = z.object({
  applicationId: z.string().uuid(),
  feedbackFormDefinitionId: z.string().uuid(),
  values: z.record(z.unknown()),
  userId: z.string().uuid().optional(),
  interviewEventId: z.string().uuid().optional(),
  authorId: z.string().uuid().optional(),
});

type AshbyFeedbackSubmitRequest = z.infer<
  typeof AshbyFeedbackSubmitRequestSchema
>;

const AshbyFeedbackSubmitResponseSchema = z.object({
  submittedValues: z.record(z.unknown()),
});

type AshbyFeedbackSubmitResponse = z.infer<
  typeof AshbyFeedbackSubmitResponseSchema
>;

const AshbyReportSynchronousRequestSchema = z.object({
  reportId: z.string().uuid(),
});

type AshbyReportSynchronousRequest = z.infer<
  typeof AshbyReportSynchronousRequestSchema
>;

const AshbyReportSynchronousResponseSchema = z.object({
  data: z.array(z.record(z.unknown())),
  fields: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
    })
  ),
});

type AshbyReportSynchronousResponse = z.infer<
  typeof AshbyReportSynchronousResponseSchema
>;

async function getAshbyApiKey(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<Result<string, MCPError>> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return new Err(
      new MCPError(
        "Ashby API key not configured. Please configure a secret containing your Ashby API key in the agent settings.",
        {
          tracked: false,
        }
      )
    );
  }

  const secret = await DustAppSecret.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const apiKey = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;
  if (!apiKey) {
    return new Err(
      new MCPError(
        "Ashby API key not found in workspace secrets. Please check the secret configuration.",
        {
          tracked: false,
        }
      )
    );
  }

  return new Ok(apiKey);
}

class AshbyClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.apiKey}:`).toString("base64");
    return `Basic ${credentials}`;
  }

  async listCandidates({
    cursor,
    limit = 100,
  }: {
    cursor?: string;
    limit?: number;
  }): Promise<Result<AshbyCandidateListResponse, Error>> {
    const response = await fetch(`${ASHBY_API_BASE_URL}/candidate.list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: this.getAuthHeader(),
      },
      body: JSON.stringify({
        cursor,
        limit,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Ashby API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err(new Error("Ashby API returned empty response"));
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(responseText);
    } catch (e) {
      const error = normalizeError(e);
      return new Err(new Error(`Invalid JSON response: ${error.message}`));
    }

    const parseResult = AshbyCandidateListResponseSchema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error("[Ashby MCP Server] Invalid API response format", {
        error: parseResult.error.message,
        rawData,
      });
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async submitFeedback(
    request: AshbyFeedbackSubmitRequest
  ): Promise<Result<AshbyFeedbackSubmitResponse, Error>> {
    const response = await fetch(
      `${ASHBY_API_BASE_URL}/applicationFeedback.submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.getAuthHeader(),
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Ashby API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err(new Error("Ashby API returned empty response"));
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(responseText);
    } catch (e) {
      const error = normalizeError(e);
      return new Err(new Error(`Invalid JSON response: ${error.message}`));
    }

    const parseResult = AshbyFeedbackSubmitResponseSchema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error("[Ashby MCP Server] Invalid API response format", {
        error: parseResult.error.message,
        rawData,
      });
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }

  async getReportData(
    request: AshbyReportSynchronousRequest
  ): Promise<Result<AshbyReportSynchronousResponse, Error>> {
    const response = await fetch(
      `${ASHBY_API_BASE_URL}/report.synchronous`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: this.getAuthHeader(),
        },
        body: JSON.stringify(request),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return new Err(
        new Error(
          `Ashby API error (${response.status}): ${errorText || response.statusText}`
        )
      );
    }

    const responseText = await response.text();
    if (!responseText) {
      return new Err(new Error("Ashby API returned empty response"));
    }

    let rawData: unknown;
    try {
      rawData = JSON.parse(responseText);
    } catch (e) {
      const error = normalizeError(e);
      return new Err(new Error(`Invalid JSON response: ${error.message}`));
    }

    const parseResult = AshbyReportSynchronousResponseSchema.safeParse(rawData);

    if (!parseResult.success) {
      logger.error("[Ashby MCP Server] Invalid API response format", {
        error: parseResult.error.message,
        rawData,
      });
      return new Err(
        new Error(
          `Invalid Ashby API response format: ${parseResult.error.message}`
        )
      );
    }

    return new Ok(parseResult.data);
  }
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("ashby");

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
              value === null || value === undefined
                ? ""
                : String(value);
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
    "create_feedback",
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
