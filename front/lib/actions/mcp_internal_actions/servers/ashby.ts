import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

const localLogger = logger.child({ module: "ashby_mcp_server" });

// Ashby API configuration
const ASHBY_API_BASE_URL = "https://api.ashbyhq.com";

// Error messages
const ERROR_MESSAGES = {
  NO_ACCESS_TOKEN: "No API key found for Ashby",
  CANDIDATE_NOT_FOUND: "Candidate not found",
  NO_CANDIDATES_FOUND: "No candidates found",
  NO_JOBS_FOUND: "No jobs found",
  API_ERROR: "Ashby API error",
} as const;

// Type definitions for Ashby API responses
interface AshbyCandidate {
  id: string;
  name: string;
  primaryEmailAddress?: {
    value: string;
    type: string;
  };
  phoneNumbers?: Array<{
    value: string;
    type: string;
  }>;
  socialLinks?: Array<{
    url: string;
    type: string;
  }>;
  tags?: Array<{
    id: string;
    title: string;
  }>;
  createdAt: string;
  updatedAt?: string;
  customFields?: Array<{
    id: string;
    value: any;
  }>;
}

interface AshbyJob {
  id: string;
  title: string;
  status: string;
  departmentId?: string;
  locationId?: string;
  openDate?: string;
  closeDate?: string;
  employmentType?: string;
  confidential?: boolean;
  requisitionId?: string;
}

interface AshbyApplication {
  id: string;
  candidateId: string;
  jobId: string;
  status: string;
  currentInterviewStageId?: string;
  createdAt: string;
  updatedAt?: string;
  source?: {
    sourceType: string;
  };
}

interface AshbyListResponse<T> {
  results: T[];
  nextCursor?: string;
  moreDataAvailable: boolean;
}

/**
 * Helper function to make authenticated requests to Ashby API
 */
async function ashbyRequest<T>(
  endpoint: string,
  apiKey: string,
  body?: Record<string, any>
): Promise<Result<T, string>> {
  try {
    // Ashby uses Basic Auth with API key as username and empty password
    const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;

    const response = await fetch(`${ASHBY_API_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      localLogger.error(
        {
          endpoint,
          status: response.status,
          errorText,
        },
        "Ashby API request failed"
      );
      return new Err(
        `Ashby API error (${response.status}): ${errorText || response.statusText}`
      );
    }

    const data = await response.json();
    return new Ok(data as T);
  } catch (error) {
    const normalizedError = normalizeError(error);
    localLogger.error(
      {
        endpoint,
        error: normalizedError,
      },
      "Ashby API request exception"
    );
    return new Err(normalizedError.message);
  }
}

/**
 * Format candidate data for display
 */
function formatCandidate(candidate: AshbyCandidate): string {
  const parts = [`Candidate: ${candidate.name}`];

  if (candidate.primaryEmailAddress) {
    parts.push(`Email: ${candidate.primaryEmailAddress.value}`);
  }

  if (candidate.phoneNumbers && candidate.phoneNumbers.length > 0) {
    parts.push(
      `Phone: ${candidate.phoneNumbers.map((p) => p.value).join(", ")}`
    );
  }

  if (candidate.socialLinks && candidate.socialLinks.length > 0) {
    parts.push(
      `Social Links: ${candidate.socialLinks.map((l) => `${l.type}: ${l.url}`).join(", ")}`
    );
  }

  if (candidate.tags && candidate.tags.length > 0) {
    parts.push(`Tags: ${candidate.tags.map((t) => t.title).join(", ")}`);
  }

  parts.push(`ID: ${candidate.id}`);
  parts.push(`Created: ${candidate.createdAt}`);

  if (candidate.updatedAt) {
    parts.push(`Updated: ${candidate.updatedAt}`);
  }

  return parts.join("\n");
}

/**
 * Format job data for display
 */
function formatJob(job: AshbyJob): string {
  const parts = [`Job: ${job.title}`, `Status: ${job.status}`, `ID: ${job.id}`];

  if (job.departmentId) {
    parts.push(`Department ID: ${job.departmentId}`);
  }

  if (job.locationId) {
    parts.push(`Location ID: ${job.locationId}`);
  }

  if (job.employmentType) {
    parts.push(`Employment Type: ${job.employmentType}`);
  }

  if (job.requisitionId) {
    parts.push(`Requisition ID: ${job.requisitionId}`);
  }

  if (job.openDate) {
    parts.push(`Open Date: ${job.openDate}`);
  }

  if (job.closeDate) {
    parts.push(`Close Date: ${job.closeDate}`);
  }

  return parts.join("\n");
}

/**
 * Helper to handle authentication and error handling
 */
async function withAuth({
  action,
  authInfo,
}: {
  action: (apiKey: string) => Promise<CallToolResult>;
  authInfo?: AuthInfo;
}): Promise<CallToolResult> {
  const apiKey = authInfo?.token;
  if (!apiKey) {
    return {
      isError: true,
      content: [{ type: "text", text: ERROR_MESSAGES.NO_ACCESS_TOKEN }],
    };
  }

  try {
    return await action(apiKey);
  } catch (error) {
    const normalizedError = normalizeError(error);
    localLogger.error(
      {
        error: normalizedError,
      },
      "Ashby MCP server error"
    );
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `${ERROR_MESSAGES.API_ERROR}: ${normalizedError.message}`,
        },
      ],
    };
  }
}

/**
 * Create the Ashby MCP server
 */
function createServer(): McpServer {
  const server = makeInternalMCPServer("ashby");

  // Tool 1: Search for candidates
  server.tool(
    "search_candidates",
    "Search for candidates by name and/or email. Returns up to 100 candidates. Use this for finding specific candidates when you know their name or email. For broader searches or pagination, use list_candidates instead.",
    {
      name: z
        .string()
        .optional()
        .describe(
          "The candidate's name to search for (partial matches supported)"
        ),
      email: z
        .string()
        .optional()
        .describe("The candidate's email address to search for (exact match)"),
    },
    async ({ name, email }, { authInfo }) => {
      return withAuth({
        action: async (apiKey) => {
          // At least one search parameter is required
          if (!name && !email) {
            return {
              isError: true,
              content: [
                {
                  type: "text",
                  text: "At least one search parameter (name or email) must be provided",
                },
              ],
            };
          }

          const searchBody: Record<string, any> = {};
          if (name) {
            searchBody.name = name;
          }
          if (email) {
            searchBody.email = email;
          }

          const result = await ashbyRequest<{ results: AshbyCandidate[] }>(
            "/candidate.search",
            apiKey,
            searchBody
          );

          if (result.isErr()) {
            return {
              isError: true,
              content: [{ type: "text", text: result.error }],
            };
          }

          const candidates = result.value.results;

          if (candidates.length === 0) {
            return {
              isError: false,
              content: [
                { type: "text", text: ERROR_MESSAGES.NO_CANDIDATES_FOUND },
              ],
            };
          }

          const formattedCandidates = candidates
            .map((c) => formatCandidate(c))
            .join("\n\n---\n\n");

          return {
            isError: false,
            content: [
              {
                type: "text",
                text: `Found ${candidates.length} candidate(s)`,
              },
              { type: "text", text: formattedCandidates },
              {
                type: "text",
                text: `\nRaw data:\n${JSON.stringify(candidates, null, 2)}`,
              },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Tool 2: Get a specific candidate by ID
  server.tool(
    "get_candidate",
    "Get detailed information about a specific candidate by their Ashby ID. Use this after finding a candidate via search to get their complete profile.",
    {
      candidateId: z
        .string()
        .describe(
          "The Ashby candidate ID (e.g., obtained from search results)"
        ),
    },
    async ({ candidateId }, { authInfo }) => {
      return withAuth({
        action: async (apiKey) => {
          const result = await ashbyRequest<{ results: AshbyCandidate[] }>(
            "/candidate.info",
            apiKey,
            { candidateId }
          );

          if (result.isErr()) {
            return {
              isError: true,
              content: [{ type: "text", text: result.error }],
            };
          }

          // candidate.info returns an object with the candidate data directly
          const candidate = result.value.results?.[0];

          if (!candidate) {
            return {
              isError: true,
              content: [
                { type: "text", text: ERROR_MESSAGES.CANDIDATE_NOT_FOUND },
              ],
            };
          }

          const formatted = formatCandidate(candidate);

          return {
            isError: false,
            content: [
              { type: "text", text: "Candidate retrieved successfully" },
              { type: "text", text: formatted },
              {
                type: "text",
                text: `\nRaw data:\n${JSON.stringify(candidate, null, 2)}`,
              },
            ],
          };
        },
        authInfo,
      });
    }
  );

  // Tool 3: List all jobs
  server.tool(
    "list_jobs",
    "List all jobs in the organization. You can filter by status. By default, returns all open, closed, and archived jobs. Use includeConfidential to include confidential job postings.",
    {
      status: z
        .array(z.enum(["Open", "Closed", "Archived", "Draft"]))
        .optional()
        .describe(
          "Array of job statuses to filter by. Options: 'Open', 'Closed', 'Archived', 'Draft'. If not provided, returns Open, Closed, and Archived jobs (not Draft)."
        ),
      includeConfidential: z
        .boolean()
        .optional()
        .describe(
          "Whether to include confidential job postings. Default is false."
        ),
      limit: z
        .number()
        .min(1)
        .max(500)
        .optional()
        .default(100)
        .describe(
          "Maximum number of jobs to return. Default is 100, max is 500."
        ),
    },
    async (
      { status, includeConfidential = false, limit = 100 },
      { authInfo }
    ) => {
      return withAuth({
        action: async (apiKey) => {
          const requestBody: Record<string, any> = {
            includeConfidential,
          };

          if (status && status.length > 0) {
            requestBody.status = status;
          }

          const result = await ashbyRequest<AshbyListResponse<AshbyJob>>(
            "/job.list",
            apiKey,
            requestBody
          );

          if (result.isErr()) {
            return {
              isError: true,
              content: [{ type: "text", text: result.error }],
            };
          }

          const jobs = result.value.results.slice(0, limit);

          if (jobs.length === 0) {
            return {
              isError: false,
              content: [{ type: "text", text: ERROR_MESSAGES.NO_JOBS_FOUND }],
            };
          }

          const formattedJobs = jobs
            .map((j) => formatJob(j))
            .join("\n\n---\n\n");

          const message =
            jobs.length < result.value.results.length
              ? `Showing ${jobs.length} of ${result.value.results.length} jobs (limited to ${limit})`
              : `Found ${jobs.length} job(s)`;

          return {
            isError: false,
            content: [
              { type: "text", text: message },
              { type: "text", text: formattedJobs },
              {
                type: "text",
                text: `\nRaw data:\n${JSON.stringify(jobs, null, 2)}`,
              },
            ],
          };
        },
        authInfo,
      });
    }
  );

  return server;
}

export default createServer;
