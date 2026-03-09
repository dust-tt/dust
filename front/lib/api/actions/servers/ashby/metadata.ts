import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AshbyCreateReferralInputSchema } from "@app/lib/api/actions/servers/ashby/types";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const DEFAULT_SEARCH_LIMIT = 20;
export const GET_REFERRAL_FORM_TOOL_NAME = "get_referral_form";
export const CREATE_REFERRAL_TOOL_NAME = "create_referral";

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
      running: "Searching candidates on Ashby",
      done: "Search candidates on Ashby",
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
      running: "Retrieving Ashby report data",
      done: "Retrieve Ashby report data",
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
      running: "Retrieving interview feedback from Ashby",
      done: "Retrieve interview feedback from Ashby",
    },
  },
  get_candidate_notes: {
    description:
      "Retrieve all notes for a candidate. " +
      "This tool will search for the candidate by name or email and return all notes on their profile.",
    schema: CandidateSearchSchema,
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving candidate notes from Ashby",
      done: "Retrieve candidate notes from Ashby",
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
      running: "Creating candidate note on Ashby",
      done: "Create candidate note on Ashby",
    },
  },
  [GET_REFERRAL_FORM_TOOL_NAME]: {
    description:
      "Retrieve the referral form definition from Ashby. " +
      "Returns all form fields with their titles, types, and whether they are required. " +
      "You must call this tool before creating a referral to know the available fields.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving referral form from Ashby",
      done: "Retrieve referral form from Ashby",
    },
  },
  [CREATE_REFERRAL_TOOL_NAME]: {
    description:
      "Create a referral for a candidate in Ashby. " +
      `You must call ${GET_REFERRAL_FORM_TOOL_NAME} first to know the available fields. ` +
      "The credited user is resolved automatically from the authenticated user. " +
      "Field values must be provided as {title, value} pairs where title is " +
      `the human-readable field title exactly as returned by ${GET_REFERRAL_FORM_TOOL_NAME}.`,
    schema: AshbyCreateReferralInputSchema.shape,
    stake: "high",
    displayLabels: {
      running: "Creating referral on Ashby",
      done: "Create referral on Ashby",
    },
  },
  list_job_postings: {
    description:
      "List all published job postings in Ashby. " +
      "Returns job postings with their title, department, team, location, " +
      "employment type, workplace type, and other details. " +
      "By default includes both listed and unlisted postings. " +
      "Set listedOnly to true to only return publicly listed postings.",
    schema: {
      location: z
        .string()
        .optional()
        .describe("Filter by location name (case sensitive)."),
      department: z
        .string()
        .optional()
        .describe("Filter by department name (case sensitive)."),
      listedOnly: z
        .boolean()
        .optional()
        .describe(
          "If true, only return publicly listed job postings. " +
            "Defaults to false."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing job postings from Ashby",
      done: "List job postings from Ashby",
    },
  },
  update_job_posting: {
    description:
      "Update an existing job posting in Ashby. " +
      "You can update the title, description, and/or workplace type. " +
      "The description must be in HTML format " +
      "(supported tags: h1-h6, b, i, u, a, ul, ol, li, code, pre). " +
      "When description openings and closings are not suppressed, only the " +
      "descriptionBody part is modifiable. To fully customize the description, " +
      "set both suppressDescriptionOpening and suppressDescriptionClosing to true.",
    schema: {
      jobPostingId: z.string().describe("The ID of the job posting to update."),
      title: z.string().optional().describe("A new title for the job posting."),
      descriptionHtml: z
        .string()
        .optional()
        .describe(
          "Updated HTML description for the job posting. " +
            "Only the descriptionBody part is modifiable unless " +
            "both suppressDescriptionOpening and suppressDescriptionClosing are true."
        ),
      workplaceType: z
        .enum(["OnSite", "Hybrid", "Remote"])
        .optional()
        .describe(
          "The type of workplace for the job posting: " +
            "OnSite, Hybrid, or Remote."
        ),
      suppressDescriptionOpening: z
        .boolean()
        .optional()
        .describe(
          "When true, the job description opening from the brand " +
            "will be suppressed."
        ),
      suppressDescriptionClosing: z
        .boolean()
        .optional()
        .describe(
          "When true, the job description closing from the brand " +
            "will be suppressed."
        ),
    },
    stake: "high",
    displayLabels: {
      running: "Updating job posting on Ashby",
      done: "Update job posting on Ashby",
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
    documentationUrl: "https://docs.dust.tt/docs/ashby-mcp",
    instructions: null,
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
