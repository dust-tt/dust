import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const UKG_READY_TOOL_NAME = "ukg_ready" as const;

export const UKG_READY_TOOLS_METADATA = createToolsRecord({
  get_my_info: {
    description:
      "Get your own employee information from UKG Ready, including your employee ID, name, and username.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving UKG Ready employee info",
      done: "Retrieve UKG Ready employee info",
    },
  },
  get_pto_requests: {
    description:
      "Get your PTO/time-off requests. Can filter by date range and account IDs.",
    schema: {
      fromDate: z
        .string()
        .optional()
        .describe("Filter requests starting from this date (YYYY-MM-DD)"),
      toDate: z
        .string()
        .optional()
        .describe("Filter requests ending before this date (YYYY-MM-DD)"),
      usernames: z
        .array(z.string())
        .optional()
        .describe("List of usernames to filter by"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving UKG Ready PTO requests",
      done: "Retrieve UKG Ready PTO requests",
    },
  },
  get_accrual_balances: {
    description: "Get accrual balances for yourself or a specific employee.",
    schema: {
      accountId: z
        .string()
        .optional()
        .describe(
          "Account ID of the employee to get balances for. If not provided, returns your own balances."
        ),
      asOfDate: z
        .string()
        .optional()
        .describe(
          "Get balance as of a specific date (YYYY-MM-DD). If not provided, returns current balance."
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving UKG Ready accrual balances",
      done: "Retrieve UKG Ready accrual balances",
    },
  },
  get_pto_request_notes: {
    description: "Get notes/comments for a specific PTO request.",
    schema: {
      noteThreadId: z
        .string()
        .describe(
          "The note thread ID for the PTO request (found in the note_thread_id field of a PTO request)"
        ),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Retrieving UKG Ready PTO notes",
      done: "Retrieve UKG Ready PTO notes",
    },
  },
  create_pto_request: {
    description:
      "Create a new time off request. Use get_accrual_balances to see available time off types.",
    schema: {
      timeOffTypeName: z
        .string()
        .describe(
          "CRITICAL: Must be the EXACT time off type name from get_accrual_balances output. First call get_accrual_balances, find the line starting with 'Time Off Type Name:', then copy the text between the quotes character-for-character (including spaces, parentheses, and capitalization). Do NOT modify. If the request fails with 'Time Off not found', validate that you copied the exact name from get_accrual_balances."
        ),
      requestType: z
        .enum(["FullDay", "Partial", "PartialBlk", "Multiple", "Dynamic"])
        .describe(
          "Field requirements vary by request type: FullDay requires from_date; Partial requires from_date, from_time, to_time; PartialBlk requires from_date, total_time; Multiple requires from_date, to_date; Dynamic requires from_date, dynamic_duration."
        ),
      fromDate: z.string().describe("Start date in YYYY-MM-DD format"),
      toDate: z.string().optional().describe("End date in YYYY-MM-DD format"),
      fromTime: z
        .string()
        .optional()
        .describe(
          "Start time in HH:MM:SS format (24-hour, required for Partial type only)"
        ),
      toTime: z
        .string()
        .optional()
        .describe(
          "End time in HH:MM:SS format (24-hour, required for Partial type only)"
        ),
      totalTime: z
        .string()
        .optional()
        .describe(
          "Total time in decimal format (required for PartialBlk type only, e.g., '1.00' for 1 hour)"
        ),
      dynamicDuration: z
        .enum([
          "FULL_DAY",
          "FIRST_HALF_OF_DAY",
          "SECOND_HALF_OF_DAY",
          "HALF_DAY",
          "FILL_DAY",
        ])
        .optional()
        .describe(
          "Dynamic duration (required for Dynamic type only): FULL_DAY, FIRST_HALF_OF_DAY, SECOND_HALF_OF_DAY, HALF_DAY, FILL_DAY"
        ),
      comment: z
        .string()
        .optional()
        .describe("Optional comment/note for the PTO request"),
    },
    stake: "low",
    displayLabels: {
      running: "Creating UKG Ready PTO request",
      done: "Create UKG Ready PTO request",
    },
  },
  delete_pto_request: {
    description: "Delete one or more PTO/time-off requests.",
    schema: {
      requestIds: z
        .array(z.string())
        .describe("Array of PTO request IDs to delete"),
      comment: z
        .string()
        .optional()
        .describe("Optional comment explaining the deletion"),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting UKG Ready PTO request",
      done: "Delete UKG Ready PTO request",
    },
  },
  get_schedules: {
    description: "Get work schedules for yourself or a specific employee.",
    schema: {
      username: z
        .string()
        .optional()
        .describe(
          "Username of the employee to get schedules for. If not provided, returns your own schedules."
        ),
      fromDate: z
        .string()
        .optional()
        .describe("Filter schedules from this date (YYYY-MM-DD)"),
      toDate: z
        .string()
        .optional()
        .describe("Filter schedules to this date (YYYY-MM-DD)"),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing UKG Ready schedules",
      done: "List UKG Ready schedules",
    },
  },
  get_employees: {
    description: "Get a list of active employees.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Listing UKG Ready employees",
      done: "List UKG Ready employees",
    },
  },
});

export const UKG_READY_SERVER = {
  serverInfo: {
    name: "ukg_ready",
    version: "1.0.0",
    description:
      "Manage employee time-off requests, schedules, and accrual balances in UKG Ready.",
    authorization: {
      provider: "ukg_ready",
      supported_use_cases: ["personal_actions"],
    },
    icon: "UkgLogo",
    documentationUrl: "https://docs.dust.tt/docs/ukg-ready",
    instructions: null,
  },
  tools: Object.values(UKG_READY_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(UKG_READY_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
