import type { JSONSchema7 as JSONSchema } from "json-schema";

export const meetingContentReadySchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    recording_id: {
      type: "integer",
      description: "Unique identifier for the meeting recording",
    },
    title: {
      type: "string",
      description: "Meeting name/title",
    },
    meeting_title: {
      type: ["string", "null"],
      description: "Calendar event title",
    },
    url: {
      type: "string",
      description: "Fathom video link",
    },
    share_url: {
      type: "string",
      description: "Shareable video link",
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "When the meeting content became ready",
    },
    scheduled_start_time: {
      type: "string",
      format: "date-time",
      description: "Calendar event scheduled start time",
    },
    scheduled_end_time: {
      type: "string",
      format: "date-time",
      description: "Calendar event scheduled end time",
    },
    recording_start_time: {
      type: "string",
      format: "date-time",
      description: "Actual recording start time",
    },
    recording_end_time: {
      type: "string",
      format: "date-time",
      description: "Actual recording end time",
    },
    transcript_language: {
      type: "string",
      description: "Language code of the transcript (e.g., 'en')",
    },
    transcript: {
      type: ["array", "null"],
      description: "Meeting transcript with speaker contributions",
      items: {
        type: "object",
        properties: {
          speaker: {
            type: "string",
            description: "Speaker name or identifier",
          },
          text: {
            type: "string",
            description: "Spoken text",
          },
          timestamp: {
            type: "number",
            description: "Timestamp in seconds from recording start",
          },
        },
      },
    },
    default_summary: {
      type: ["object", "null"],
      description: "AI-generated meeting summary",
      properties: {
        markdown: {
          type: "string",
          description: "Summary in markdown format",
        },
        plain_text: {
          type: "string",
          description: "Summary in plain text format",
        },
      },
    },
    action_items: {
      type: ["array", "null"],
      description: "Action items extracted from the meeting",
      items: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "Action item description",
          },
          assignee: {
            type: ["string", "null"],
            description: "Person assigned to the action item",
          },
          due_date: {
            type: ["string", "null"],
            format: "date-time",
            description: "Due date for the action item",
          },
        },
      },
    },
    calendar_invitees: {
      type: "array",
      description: "Attendees from the calendar event",
      items: {
        type: "object",
        properties: {
          email: {
            type: "string",
            description: "Attendee email address",
          },
          name: {
            type: ["string", "null"],
            description: "Attendee name",
          },
          domain: {
            type: "string",
            description: "Email domain of the attendee",
          },
        },
      },
    },
    calendar_invitees_domains_type: {
      type: "string",
      enum: ["only_internal", "one_or_more_external"],
      description:
        "Whether all invitees are internal or if there are external participants",
    },
    recorded_by: {
      type: "object",
      description: "User who initiated the recording",
      properties: {
        user_id: {
          type: "integer",
          description: "Fathom user ID",
        },
        email: {
          type: "string",
          description: "User email address",
        },
        name: {
          type: "string",
          description: "User full name",
        },
      },
    },
    crm_matches: {
      type: ["object", "null"],
      description: "Linked CRM records (contacts, companies, deals)",
      properties: {
        contacts: {
          type: "array",
          description: "Matched CRM contacts",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "CRM contact ID",
              },
              name: {
                type: "string",
                description: "Contact name",
              },
              email: {
                type: "string",
                description: "Contact email",
              },
            },
          },
        },
        companies: {
          type: "array",
          description: "Matched CRM companies",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "CRM company ID",
              },
              name: {
                type: "string",
                description: "Company name",
              },
            },
          },
        },
        deals: {
          type: "array",
          description: "Matched CRM deals",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "CRM deal ID",
              },
              name: {
                type: "string",
                description: "Deal name",
              },
              amount: {
                type: ["number", "null"],
                description: "Deal amount",
              },
            },
          },
        },
      },
    },
  },
  required: [
    "recording_id",
    "title",
    "url",
    "share_url",
    "created_at",
    "recording_start_time",
    "recording_end_time",
    "recorded_by",
  ],
};
