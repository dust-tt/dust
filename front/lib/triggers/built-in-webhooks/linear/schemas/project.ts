import type { JSONSchema7 as JSONSchema } from "json-schema";

export const projectSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "ProjectWebhookPayload",
  type: "object",
  description:
    "Payload for a Project webhook event from Linear, fully expanded with no references.",
  required: [
    "color",
    "completedIssueCountHistory",
    "completedScopeHistory",
    "createdAt",
    "description",
    "id",
    "inProgressScopeHistory",
    "initiatives",
    "issueCountHistory",
    "labelIds",
    "memberIds",
    "milestones",
    "name",
    "priority",
    "prioritySortOrder",
    "scopeHistory",
    "slugId",
    "sortOrder",
    "status",
    "statusId",
    "teamIds",
    "updatedAt",
    "url",
  ],
  properties: {
    archivedAt: {
      type: ["string", "null"],
      description: "When the project was archived.",
    },
    autoArchivedAt: {
      type: ["string", "null"],
      description: "Auto-archive timestamp, if any.",
    },
    canceledAt: {
      type: ["string", "null"],
      description: "When the project was canceled.",
    },
    color: { type: "string", description: "Project color." },
    completedAt: {
      type: ["string", "null"],
      description: "When the project was marked completed.",
    },
    completedIssueCountHistory: {
      type: "array",
      description: "Weekly counts of completed issues.",
      items: { type: "number" },
    },
    completedScopeHistory: {
      type: "array",
      description: "Weekly completed scope (points).",
      items: { type: "number" },
    },
    content: {
      type: ["string", "null"],
      description: "Project content (rich text).",
    },
    convertedFromIssueId: {
      type: ["string", "null"],
      description: "ID of the issue the project was converted from.",
    },
    createdAt: { type: "string", description: "Creation timestamp." },
    creatorId: {
      type: ["string", "null"],
      description: "User ID of the project creator.",
    },
    description: { type: "string", description: "Project description." },
    documentContentId: {
      type: ["string", "null"],
      description: "Linked document content ID.",
    },
    health: {
      type: ["string", "null"],
      description: "Health status (e.g., onTrack, atRisk, offTrack).",
    },
    healthUpdatedAt: {
      type: ["string", "null"],
      description: "Timestamp when health was last updated.",
    },
    icon: { type: ["string", "null"], description: "Icon key or URL." },
    id: { type: "string", description: "Project ID." },
    inProgressScopeHistory: {
      type: "array",
      description: "Weekly in-progress scope (points).",
      items: { type: "number" },
    },
    initiatives: {
      type: "array",
      description:
        "Associated initiatives (inlined InitiativeChildWebhookPayload).",
      items: {
        type: "object",
        required: ["id", "name", "url"],
        properties: {
          id: { type: "string", description: "Initiative ID." },
          name: { type: "string", description: "Initiative name." },
          url: { type: "string", description: "Initiative URL." },
        },
        additionalProperties: false,
      },
    },
    issueCountHistory: {
      type: "array",
      description: "Weekly total issue counts.",
      items: { type: "number" },
    },
    labelIds: {
      type: "array",
      description: "IDs of labels associated to the project.",
      items: { type: "string" },
    },
    lastAppliedTemplateId: {
      type: ["string", "null"],
      description: "Last applied template ID.",
    },
    lastUpdateId: {
      type: ["string", "null"],
      description: "ID of the latest posted project update.",
    },
    lead: {
      type: ["object", "null"],
      description: "Project lead (inlined UserChildWebhookPayload).",
      required: ["active", "admin", "displayName", "email", "id", "name"],
      properties: {
        active: { type: "boolean" },
        admin: { type: "boolean" },
        avatarUrl: { type: ["string", "null"] },
        displayName: { type: "string" },
        email: { type: "string" },
        id: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
    leadId: { type: ["string", "null"], description: "Project lead user ID." },
    memberIds: {
      type: "array",
      description: "User IDs of project members.",
      items: { type: "string" },
    },
    milestones: {
      type: "array",
      description:
        "Project milestones (inlined ProjectMilestoneChildWebhookPayload).",
      items: {
        type: "object",
        required: ["id", "name", "targetDate"],
        properties: {
          id: { type: "string", description: "Milestone ID." },
          name: { type: "string", description: "Milestone name." },
          targetDate: {
            type: "string",
            description: "Target date (YYYY-MM-DD).",
          },
        },
        additionalProperties: false,
      },
    },
    name: { type: "string", description: "Project name." },
    priority: {
      type: "number",
      description: "Priority: 0 None, 1 Urgent, 2 High, 3 Normal, 4 Low.",
    },
    prioritySortOrder: {
      type: "number",
      description: "Org-level sort order by priority.",
    },
    projectUpdateRemindersPausedUntilAt: {
      type: ["string", "null"],
      description: "Reminders paused until this time.",
    },
    scopeHistory: {
      type: "array",
      description: "Weekly total scope (points).",
      items: { type: "number" },
    },
    slugId: { type: "string", description: "URL slug ID." },
    sortOrder: { type: "number", description: "Org-level sort order." },
    startDate: {
      type: ["string", "null"],
      description: "Estimated start date (YYYY-MM-DD).",
    },
    startDateResolution: {
      type: ["string", "null"],
      description: "Start date resolution, if applicable.",
    },
    status: {
      type: "object",
      description: "Project status (inlined ProjectStatusChildWebhookPayload).",
      required: ["color", "id", "name", "type"],
      properties: {
        color: { type: "string", description: "Status color." },
        id: { type: "string", description: "Status ID." },
        name: { type: "string", description: "Status name." },
        type: { type: "string", description: "Status type/category." },
      },
      additionalProperties: false,
    },
    statusId: { type: "string", description: "Status ID." },
    targetDate: {
      type: ["string", "null"],
      description: "Estimated completion date (YYYY-MM-DD).",
    },
    targetDateResolution: {
      type: ["string", "null"],
      description: "Target date resolution, if applicable.",
    },
    teamIds: {
      type: "array",
      description: "Associated team IDs.",
      items: { type: "string" },
    },
    trashed: {
      type: ["boolean", "null"],
      description: "Whether the project is trashed.",
    },
    updatedAt: { type: "string", description: "Last update timestamp." },
    url: { type: "string", description: "Project URL." },
  },
  additionalProperties: false,
};
