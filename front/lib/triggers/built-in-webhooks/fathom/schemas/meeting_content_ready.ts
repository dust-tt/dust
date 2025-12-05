import type { JSONSchema7 as JSONSchema } from "json-schema";

export const meetingContentReadySchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  properties: {
    title: {
      type: "string",
      description: "Calendar event title",
    },
    meeting_title: {
      type: ["string", "null"],
      description: "Meeting name",
    },
    recording_id: {
      type: "integer",
      description: "Unique identifier for the recording",
    },
    url: {
      type: "string",
      format: "uri",
      description: "Link to the Fathom recording",
    },
    share_url: {
      type: "string",
      format: "uri",
      description: "Shareable link to the recording",
    },
    created_at: {
      type: "string",
      format: "date-time",
      description: "When the recording was created",
    },
    scheduled_start_time: {
      type: "string",
      format: "date-time",
      description: "Scheduled start time of the meeting",
    },
    scheduled_end_time: {
      type: "string",
      format: "date-time",
      description: "Scheduled end time of the meeting",
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
    calendar_invitees_domains_type: {
      type: "string",
      enum: ["only_internal", "one_or_more_external"],
      description: "Type of calendar invitees by domain",
    },
    transcript_language: {
      type: "string",
      description: "Language of the transcript",
    },
    recorded_by: {
      type: "object",
      description: "User who recorded the meeting",
      properties: {
        name: {
          type: "string",
          description: "Name of the user",
        },
        email: {
          type: "string",
          format: "email",
          description: "Email of the user",
        },
        email_domain: {
          type: "string",
          description: "Email domain of the user",
        },
        team: {
          type: ["string", "null"],
          description: "Team the user belongs to",
        },
      },
      required: ["name", "email", "email_domain"],
    },
    calendar_invitees: {
      type: "array",
      description: "List of calendar invitees",
      items: {
        type: "object",
        properties: {
          name: {
            type: ["string", "null"],
            description: "Name of the invitee",
          },
          matched_speaker_display_name: {
            type: ["string", "null"],
            description: "Display name of matched speaker",
          },
          email: {
            type: "string",
            format: "email",
            description: "Email of the invitee",
          },
          email_domain: {
            type: "string",
            description: "Email domain of the invitee",
          },
          is_external: {
            type: "boolean",
            description: "Whether the invitee is external",
          },
        },
        required: ["email", "email_domain", "is_external"],
      },
    },
    transcript: {
      type: ["array", "null"],
      description: "Meeting transcript",
      items: {
        type: "object",
        properties: {
          speaker: {
            type: "object",
            properties: {
              display_name: {
                type: "string",
                description: "Display name of the speaker",
              },
              matched_calendar_invitee_email: {
                type: ["string", "null"],
                format: "email",
                description: "Matched email from calendar invitees",
              },
            },
            required: ["display_name"],
          },
          text: {
            type: "string",
            description: "The spoken text",
          },
          timestamp: {
            type: "string",
            description: "Time marker (e.g., '00:05:32')",
          },
        },
        required: ["speaker", "text", "timestamp"],
      },
    },
    default_summary: {
      type: ["object", "null"],
      description: "Meeting summary",
      properties: {
        template_name: {
          type: ["string", "null"],
          description: "Name of the summary template used",
        },
        markdown_formatted: {
          type: ["string", "null"],
          description: "Summary content in markdown format",
        },
      },
    },
    action_items: {
      type: ["array", "null"],
      description: "Action items from the meeting",
      items: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Description of the action item",
          },
          user_generated: {
            type: "boolean",
            description: "Whether the action item was user-generated",
          },
          completed: {
            type: "boolean",
            description: "Whether the action item is completed",
          },
          recording_timestamp: {
            type: ["string", "null"],
            description: "Timestamp in the recording",
          },
          recording_playback_url: {
            type: ["string", "null"],
            format: "uri",
            description: "URL to play back at this timestamp",
          },
          assignee: {
            type: ["object", "null"],
            properties: {
              name: {
                type: ["string", "null"],
                description: "Name of the assignee",
              },
              email: {
                type: ["string", "null"],
                format: "email",
                description: "Email of the assignee",
              },
              team: {
                type: ["string", "null"],
                description: "Team of the assignee",
              },
            },
          },
        },
        required: ["description", "user_generated", "completed"],
      },
    },
    crm_matches: {
      type: ["object", "null"],
      description: "CRM data linked to the meeting",
      properties: {
        contacts: {
          type: ["array", "null"],
          items: {
            type: "object",
          },
        },
        companies: {
          type: ["array", "null"],
          items: {
            type: "object",
          },
        },
        deals: {
          type: ["array", "null"],
          items: {
            type: "object",
          },
        },
        error: {
          type: ["string", "null"],
          description: "Error message if CRM matching failed",
        },
      },
    },
  },
  required: [
    "title",
    "recording_id",
    "url",
    "share_url",
    "created_at",
    "scheduled_start_time",
    "scheduled_end_time",
    "recording_start_time",
    "recording_end_time",
    "calendar_invitees_domains_type",
    "recorded_by",
    "transcript_language",
    "calendar_invitees",
  ],
};

export const meetingContentReadyExample = {
  title: "Quarterly Business Review",
  meeting_title: "QBR 2025 Q1",
  url: "https://fathom.video/xyz123",
  share_url: "https://fathom.video/share/xyz123",
  created_at: "2025-03-01T17:01:30Z",
  scheduled_start_time: "2025-03-01T16:00:00Z",
  scheduled_end_time: "2025-03-01T17:00:00Z",
  recording_start_time: "2025-03-01T16:01:12Z",
  recording_end_time: "2025-03-01T17:00:55Z",
  calendar_invitees_domains_type: "one_or_more_external",
  transcript: [
    {
      speaker: {
        display_name: "Jane Doe",
        matched_calendar_invitee_email: "jane.doe@acme.com",
      },
      text: "Let's revisit the budget allocations.",
      timestamp: "00:05:32",
    },
    {
      speaker: {
        display_name: "John Smith",
        matched_calendar_invitee_email: "john.smith@client.com",
      },
      text: "I agree, we need to adjust our projections.",
      timestamp: "00:05:40",
    },
  ],
  default_summary: {
    template_name: "general",
    markdown_formatted:
      "## Summary\nWe reviewed Q1 OKRs, identified budget risks, and agreed to revisit projections next month.\n",
  },
  action_items: [
    {
      description: "Email revised proposal to client",
      user_generated: false,
      completed: false,
      recording_timestamp: "00:10:45",
      recording_playback_url: "https://fathom.video/xyz123#t=645",
      assignee: {
        name: "Jane Doe",
        email: "jane.doe@acme.com",
        team: "Marketing",
      },
    },
  ],
  calendar_invitees: [
    {
      name: "Alice Johnson",
      matched_speaker_display_name: "Alice Johnson",
      email: "alice.johnson@acme.com",
      is_external: false,
      email_domain: "acme.com",
    },
    {
      name: "Jane Doe",
      matched_speaker_display_name: "Jane Doe",
      email: "jane.doe@acme.com",
      is_external: false,
      email_domain: "acme.com",
    },
    {
      name: "John Smith",
      matched_speaker_display_name: "John Smith",
      email: "john.smith@client.com",
      is_external: true,
      email_domain: "client.com",
    },
  ],
  recorded_by: {
    name: "Alice Johnson",
    email: "alice.johnson@acme.com",
    team: "Customer Success",
    email_domain: "acme.com",
  },
  crm_matches: {
    contacts: [
      {
        name: "John Smith",
        email: "john.smith@client.com",
        record_url: "https://app.hubspot.com/contacts/123",
      },
    ],
    companies: [
      {
        name: "Acme Corp",
        record_url: "https://app.hubspot.com/companies/456",
      },
    ],
    deals: [
      {
        name: "Q1 Renewal",
        amount: 50000,
        record_url: "https://app.hubspot.com/deals/789",
      },
    ],
  },
};
