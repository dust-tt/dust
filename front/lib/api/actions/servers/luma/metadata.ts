import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  LumaApprovalStatusSchema,
  LumaGuestStatusActionSchema,
  LumaVisibilitySchema,
} from "@app/lib/api/actions/servers/luma/types";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const LUMA_TOOL_NAME = "luma" as const;

export const LUMA_TOOLS_METADATA = createToolsRecord({
  get_self: {
    description:
      "Get information about the authenticated Luma user. " +
      "Use this to verify the API key is working correctly.",
    schema: {},
    stake: "never_ask",
    displayLabels: {
      running: "Getting Luma user info",
      done: "Get Luma user info",
    },
  },
  get_event: {
    description:
      "Get detailed information about a specific Luma event by its ID.",
    schema: {
      event_api_id: z.string().describe("The API ID of the event to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Luma event",
      done: "Get Luma event",
    },
  },
  list_events: {
    description:
      "List events from the Luma calendar. " +
      "Optionally filter by date range using ISO 8601 datetime strings.",
    schema: {
      after: z
        .string()
        .optional()
        .describe("Only return events starting after this ISO 8601 datetime."),
      before: z
        .string()
        .optional()
        .describe("Only return events starting before this ISO 8601 datetime."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Luma events",
      done: "List Luma events",
    },
  },
  create_event: {
    description:
      "Create a new event on Luma. " +
      "Requires at minimum a name and start datetime. " +
      "The event will be created on the calendar associated with the configured API key.",
    schema: {
      name: z.string().describe("The name/title of the event."),
      start_at: z
        .string()
        .describe(
          "Start datetime in ISO 8601 format (e.g. 2026-03-20T18:00:00Z)."
        ),
      end_at: z
        .string()
        .optional()
        .describe("End datetime in ISO 8601 format."),
      timezone: z
        .string()
        .optional()
        .describe(
          "IANA timezone string (e.g. 'Europe/Paris'). Defaults to calendar timezone."
        ),
      max_capacity: z
        .number()
        .optional()
        .describe("Maximum number of attendees."),
      visibility: LumaVisibilitySchema.optional().describe(
        "Event visibility: 'public', 'members-only', or 'private'."
      ),
      description: z
        .string()
        .optional()
        .describe("Event description (supports markdown)."),
      cover_url: z.string().optional().describe("URL of the cover image."),
      location_place_id: z
        .string()
        .optional()
        .describe("Google Maps Place ID for the event location."),
      slug: z.string().optional().describe("Custom URL slug for the event."),
    },
    stake: "high",
    displayLabels: {
      running: "Creating Luma event",
      done: "Create Luma event",
    },
  },
  update_event: {
    description:
      "Update an existing Luma event. " +
      "Only the fields you provide will be updated. " +
      "Set suppress_notifications to true to avoid emailing guests about minor changes.",
    schema: {
      event_api_id: z.string().describe("The API ID of the event to update."),
      name: z.string().optional().describe("New name/title for the event."),
      start_at: z
        .string()
        .optional()
        .describe("New start datetime in ISO 8601 format."),
      end_at: z
        .string()
        .optional()
        .describe("New end datetime in ISO 8601 format."),
      timezone: z.string().optional().describe("New IANA timezone string."),
      max_capacity: z
        .number()
        .optional()
        .describe("New maximum number of attendees."),
      visibility: LumaVisibilitySchema.optional().describe(
        "New event visibility: 'public', 'members-only', or 'private'."
      ),
      description: z
        .string()
        .optional()
        .describe("New event description (supports markdown)."),
      cover_url: z.string().optional().describe("New URL of the cover image."),
      location_place_id: z
        .string()
        .optional()
        .describe("New Google Maps Place ID for the event location."),
      slug: z
        .string()
        .optional()
        .describe("New custom URL slug for the event."),
      suppress_notifications: z
        .boolean()
        .optional()
        .describe(
          "Set to true to suppress email notifications to guests about this update."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Luma event",
      done: "Update Luma event",
    },
  },
  list_guests: {
    description:
      "List guests for a specific Luma event. " +
      "Supports filtering by approval status and pagination via cursor.",
    schema: {
      event_api_id: z
        .string()
        .describe("The API ID of the event to list guests for."),
      approval_status: LumaApprovalStatusSchema.optional().describe(
        "Filter guests by approval status: 'approved', 'pending_approval', 'waitlist', 'declined', or 'invited'."
      ),
      sort_column: z
        .string()
        .optional()
        .describe(
          "Column to sort by: 'name', 'email', 'created_at', 'registered_at', or 'checked_in_at'."
        ),
      sort_direction: z
        .string()
        .optional()
        .describe(
          "Sort direction: 'asc', 'desc', 'asc nulls last', or 'desc nulls last'."
        ),
      pagination_cursor: z
        .string()
        .optional()
        .describe(
          "Pagination cursor (next_cursor value from a previous list_guests response)."
        ),
      pagination_limit: z
        .number()
        .optional()
        .describe("Number of guests to return per page."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Luma guests",
      done: "List Luma guests",
    },
  },
  get_guest: {
    description: "Get detailed information about a specific guest of an event.",
    schema: {
      event_api_id: z.string().describe("The API ID of the event."),
      guest_api_id: z.string().describe("The API ID of the guest."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Luma guest",
      done: "Get Luma guest",
    },
  },
  update_guest_status: {
    description:
      "Update the approval status of a single guest. " +
      "Can approve or decline a guest. " +
      "Use should_refund when declining guests with paid tickets.",
    schema: {
      event_api_id: z.string().describe("The API ID of the event."),
      guest_api_id_or_email: z
        .string()
        .describe("The API ID or email of the guest to update."),
      status: LumaGuestStatusActionSchema.describe(
        "The new status for the guest: 'approved' or 'declined'."
      ),
      should_refund: z
        .boolean()
        .optional()
        .describe(
          "Whether to refund the guest when declining (for paid tickets)."
        ),
    },
    stake: "medium",
    displayLabels: {
      running: "Updating Luma guest status",
      done: "Update Luma guest status",
    },
  },
  add_guests: {
    description:
      "Add one or more guests to a Luma event by email. " +
      "Guests will be added with their specified name and email.",
    schema: {
      event_api_id: z
        .string()
        .describe("The API ID of the event to add guests to."),
      guests: z
        .array(
          z.object({
            email: z.string().describe("Email address of the guest."),
            name: z.string().optional().describe("Name of the guest."),
          })
        )
        .describe("Array of guests to add."),
    },
    stake: "low",
    displayLabels: {
      running: "Adding Luma guests",
      done: "Add Luma guests",
    },
  },
  send_invites: {
    description:
      "Send event invitations to a list of email addresses. " +
      "Recipients will receive an email invitation to the event.",
    schema: {
      event_api_id: z
        .string()
        .describe("The API ID of the event to send invites for."),
      emails: z
        .array(z.string())
        .describe("Array of email addresses to send invitations to."),
    },
    stake: "medium",
    displayLabels: {
      running: "Sending Luma invites",
      done: "Send Luma invites",
    },
  },
  get_event_insights: {
    description:
      "Get total registrations, approval status breakdown, check-in rate, " +
      "registration timeline, and ticket type breakdown for an event. " +
      "Use this instead of list_guests when you need counts or aggregate stats. " +
      "Fetches all guest data internally so it may take a moment for large events.",
    schema: {
      event_api_id: z
        .string()
        .describe("The API ID of the event to get insights for."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Luma event insights",
      done: "Get Luma event insights",
    },
  },
});

export const LUMA_SERVER = {
  serverInfo: {
    name: "luma",
    version: "1.0.0",
    description: "Manage Luma events, guests, and attendance insights.",
    authorization: null,
    icon: "ActionTimeIcon", // TODO: Replace with "LumaLogo" once added to Sparkle
    documentationUrl: null,
    instructions: null,
  },
  tools: Object.values(LUMA_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(LUMA_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
