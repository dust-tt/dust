import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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
              "Ashby API key not found in workspace secrets. Please check the secret configuration."
            )
          );
        }

        const client = new AshbyClient(apiKey);
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

  return server;
}

export default createServer;
