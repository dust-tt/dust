import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";

// We use a single tool name for monitoring given the high granularity (can be revisited).
export const ASHBY_TOOL_NAME = "ashby" as const;

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

export const searchCandidatesSchema = CandidateSearchInputSchema.shape;

export const getReportDataSchema = {
  reportUrl: z
    .string()
    .describe(
      "Full URL of the Ashby report (e.g., https://app.ashbyhq.com/reports/saved/[reportId])."
    ),
};

export const getInterviewFeedbackSchema = CandidateSearchInputSchema.shape;

export const createCandidateNoteSchema = {
  ...CandidateSearchInputSchema.shape,
  noteContent: z.string().describe("The content of the note in HTML format."),
};

export const getCandidateNotesSchema = CandidateSearchInputSchema.shape;

export const ASHBY_TOOLS: MCPToolType[] = [
  {
    name: "search_candidates",
    description:
      "Search for candidates by name and/or email. Returns up to 20 matching candidates by default.",
    inputSchema: zodToJsonSchema(
      z.object(searchCandidatesSchema)
    ) as JSONSchema,
  },
  {
    name: "get_report_data",
    description: "Retrieve report data and save it as a CSV file.",
    inputSchema: zodToJsonSchema(z.object(getReportDataSchema)) as JSONSchema,
  },
  {
    name: "get_interview_feedback",
    description:
      "Retrieve interview feedback for a candidate. This tool will search for the candidate by name or email and return all submitted interview feedback for the most recent application.",
    inputSchema: zodToJsonSchema(
      z.object(getInterviewFeedbackSchema)
    ) as JSONSchema,
  },
  {
    name: "create_candidate_note",
    description:
      "Create a note on a candidate's profile in Ashby. The note content can include basic HTML formatting (supported tags: h1-h6, p, b, i, u, a, ul, ol, li, code, pre).",
    inputSchema: zodToJsonSchema(
      z.object(createCandidateNoteSchema)
    ) as JSONSchema,
  },
  {
    name: "get_candidate_notes",
    description:
      "Retrieve all notes for a candidate. This tool will search for the candidate by name or email and return all notes on their profile.",
    inputSchema: zodToJsonSchema(
      z.object(getCandidateNotesSchema)
    ) as JSONSchema,
  },
];

export const ASHBY_SERVER_INFO = {
  name: "ashby" as const,
  version: "1.0.0",
  description: "Access and manage Ashby ATS data.",
  authorization: null,
  icon: "AshbyLogo" as const,
  documentationUrl: null,
  instructions: null,
  developerSecretSelection: "required" as const,
};

export const ASHBY_TOOL_STAKES = {
  search_candidates: "never_ask",
  get_report_data: "never_ask",
  get_interview_feedback: "never_ask",
  get_candidate_notes: "never_ask",
  create_candidate_note: "high",
} as const satisfies Record<string, MCPToolStakeLevelType>;
