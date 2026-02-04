import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";

export const ASHBY_TOOL_NAME = "ashby" as const;

const DEFAULT_SEARCH_LIMIT = 20;

const CandidateSearchSchema = {
  email: z
    .string()
    .optional()
    .describe("Email address to search for (partial matches supported)."),
  name: z
    .string()
    .optional()
    .describe("Name to search for (partial matches supported)."),
};

export const ASHBY_TOOLS_METADATA = createToolsRecord({
  search_candidates: {
    description:
      "Search for candidates by name and/or email. " +
      `Returns up to ${DEFAULT_SEARCH_LIMIT} matching candidates by default.`,
    schema: CandidateSearchSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Searching candidates",
      done: "Search candidates",
    },
  },
  get_report_data: {
    description: "Retrieve report data and save it as a CSV file.",
    schema: {
      reportUrl: z
        .string()
        .describe(
          "Full URL of the Ashby report (e.g., https://app.ashbyhq.com/reports/saved/[reportId])."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving report data",
      done: "Retrieve report data",
    },
  },
  get_interview_feedback: {
    description:
      "Retrieve interview feedback for a candidate. " +
      "This tool will search for the candidate by name or email and return all submitted " +
      "interview feedback for the most recent application.",
    schema: CandidateSearchSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving interview feedback",
      done: "Retrieve interview feedback",
    },
  },
  get_candidate_notes: {
    description:
      "Retrieve all notes for a candidate. " +
      "This tool will search for the candidate by name or email and return all notes on their profile.",
    schema: CandidateSearchSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving candidate notes",
      done: "Retrieve candidate notes",
    },
  },
  create_candidate_note: {
    description:
      "Create a note on a candidate's profile in Ashby. " +
      "The note content can include basic HTML formatting (supported tags: h1-h6, p, b, i, u, a, ul, ol, li, code, pre).",
    schema: {
      ...CandidateSearchSchema,
      noteContent: z
        .string()
        .describe("The content of the note in HTML format."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating candidate note",
      done: "Create candidate note",
    },
  },
});

export const ASHBY_SERVER = {
  serverInfo: {
    name: "ashby",
    version: "1.0.0",
    description: "Access and manage Ashby ATS data.",
    authorization: null,
    icon: "AshbyLogo",
    documentationUrl: null,
    instructions: null,
    developerSecretSelection: "required",
  },
  tools: Object.values(ASHBY_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(ASHBY_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
