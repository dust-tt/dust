import type { JSONSchema7 as JSONSchema } from "json-schema";

export const issueSchema: JSONSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  title: "IssueWebhookPayload",
  type: "object",
  description:
    "Payload for an Issue webhook event from Linear, fully expanded with no references.",
  required: [
    "createdAt",
    "id",
    "identifier",
    "number",
    "priority",
    "priorityLabel",
    "prioritySortOrder",
    "reactionData",
    "state",
    "stateId",
    "subscriberIds",
    "team",
    "teamId",
    "title",
    "updatedAt",
    "url",
  ],
  properties: {
    addedToCycleAt: {
      type: ["string", "null"],
      description: "Time when the issue was added to a cycle.",
    },
    addedToProjectAt: {
      type: ["string", "null"],
      description: "Time when the issue was added to a project.",
    },
    addedToTeamAt: {
      type: ["string", "null"],
      description: "Time when the issue was added to a team.",
    },
    archivedAt: {
      type: ["string", "null"],
      description: "Time when the issue was archived.",
    },
    assignee: {
      type: ["object", "null"],
      description: "Assigned user (inlined UserChildWebhookPayload).",
      required: ["active", "admin", "displayName", "email", "id", "name"],
      properties: {
        active: {
          type: "boolean",
          description: "Whether the user is active in the workspace.",
        },
        admin: {
          type: "boolean",
          description: "Whether the user is an admin.",
        },
        avatarUrl: { type: ["string", "null"], description: "Avatar URL." },
        displayName: { type: "string", description: "Display name." },
        email: { type: "string", description: "Email address." },
        id: { type: "string", description: "User ID." },
        name: { type: "string", description: "Full name." },
      },
    },
    assigneeId: { type: ["string", "null"], description: "Assigned user ID." },
    autoArchivedAt: {
      type: ["string", "null"],
      description: "Time when the issue was auto-archived.",
    },
    autoClosedAt: {
      type: ["string", "null"],
      description: "Time when the issue was auto-closed.",
    },
    botActor: {
      type: ["string", "null"],
      description: "Bot actor metadata, if any.",
    },
    canceledAt: {
      type: ["string", "null"],
      description: "Time when the issue was canceled.",
    },
    completedAt: {
      type: ["string", "null"],
      description: "Time when the issue was completed.",
    },
    createdAt: { type: "string", description: "Creation timestamp." },
    creator: {
      type: ["object", "null"],
      description: "Creator user (inlined UserChildWebhookPayload).",
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
    },
    creatorId: { type: ["string", "null"], description: "Creator user ID." },
    cycle: {
      type: ["object", "null"],
      description: "Cycle (inlined CycleChildWebhookPayload).",
      required: ["endsAt", "id", "number", "startsAt"],
      properties: {
        endsAt: { type: "string", description: "Cycle end date." },
        id: { type: "string", description: "Cycle ID." },
        name: { type: ["string", "null"], description: "Cycle name." },
        number: { type: "number", description: "Cycle number." },
        startsAt: { type: "string", description: "Cycle start date." },
      },
    },
    cycleId: { type: ["string", "null"], description: "Cycle ID." },
    delegate: {
      type: ["object", "null"],
      description:
        "Agent user to whom the issue is delegated (inlined UserChildWebhookPayload).",
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
    },
    delegateId: {
      type: ["string", "null"],
      description: "Agent user ID for the delegate.",
    },
    description: {
      type: ["string", "null"],
      description: "Issue description (markdown).",
    },
    descriptionData: {
      type: ["string", "null"],
      description: "Structured description data.",
    },
    dueDate: {
      type: ["string", "null"],
      description: "Due date (YYYY-MM-DD).",
    },
    estimate: {
      type: ["number", "null"],
      description: "Complexity estimate (points).",
    },
    externalUserCreator: {
      type: ["object", "null"],
      description:
        "External user creator (inlined ExternalUserChildWebhookPayload).",
      required: ["displayName", "id", "name"],
      properties: {
        avatarUrl: { type: ["string", "null"], description: "Avatar URL." },
        displayName: { type: "string", description: "Display name." },
        email: { type: ["string", "null"], description: "Email." },
        id: { type: "string", description: "External user ID." },
        name: { type: "string", description: "Full name." },
      },
    },
    externalUserCreatorId: {
      type: ["string", "null"],
      description: "External user creator ID.",
    },
    id: { type: "string", description: "Issue ID." },
    identifier: { type: "string", description: "Key like ABC-123." },
    integrationSourceType: {
      type: ["string", "null"],
      description: "Integration source type if created by an integration.",
    },
    labelIds: {
      type: "array",
      description: "Label IDs on the issue.",
      items: { type: "string" },
    },
    labels: {
      type: "array",
      description: "Labels (inlined IssueLabelChildWebhookPayload).",
      items: {
        type: "object",
        required: ["color", "id", "name"],
        properties: {
          color: { type: "string", description: "Hex color." },
          id: { type: "string", description: "Label ID." },
          name: { type: "string", description: "Label name." },
        },
      },
    },
    lastAppliedTemplateId: {
      type: ["string", "null"],
      description: "Last applied template ID.",
    },
    number: {
      type: "number",
      description: "Issue numeric identifier within the team.",
    },
    parentId: {
      type: ["string", "null"],
      description: "Parent issue ID, if sub-issue.",
    },
    previousIdentifiers: {
      type: "array",
      description: "Previous identifiers (if moved between teams).",
      items: { type: "string" },
    },
    priority: {
      type: "number",
      description: "Priority: 0 None, 1 Urgent, 2 High, 3 Normal, 4 Low.",
    },
    priorityLabel: {
      type: "string",
      description: "Human-readable priority label.",
    },
    prioritySortOrder: {
      type: "number",
      description: "Org-level sort order by priority.",
    },
    project: {
      type: ["object", "null"],
      description: "Project (inlined ProjectChildWebhookPayload).",
      required: ["id", "name", "url"],
      properties: {
        id: { type: "string", description: "Project ID." },
        name: { type: "string", description: "Project name." },
        url: { type: "string", description: "Project URL." },
      },
    },
    projectId: { type: ["string", "null"], description: "Project ID." },
    projectMilestone: {
      type: ["object", "null"],
      description:
        "Project milestone (inlined ProjectMilestoneChildWebhookPayload).",
      required: ["id", "name", "targetDate"],
      properties: {
        id: { type: "string", description: "Milestone ID." },
        name: { type: "string", description: "Milestone name." },
        targetDate: {
          type: "string",
          description: "Target date (YYYY-MM-DD).",
        },
      },
    },
    projectMilestoneId: {
      type: ["string", "null"],
      description: "Milestone ID.",
    },
    reactionData: {
      type: "object",
      description: "Reaction aggregation object (shape may vary by event).",
    },
    recurringIssueTemplateId: {
      type: ["string", "null"],
      description: "Recurring issue template ID.",
    },
    slaBreachesAt: {
      type: ["string", "null"],
      description: "When the issue would breach its SLA.",
    },
    slaHighRiskAt: {
      type: ["string", "null"],
      description: "When SLA high risk phase starts.",
    },
    slaMediumRiskAt: {
      type: ["string", "null"],
      description: "When SLA medium risk phase starts.",
    },
    slaStartedAt: {
      type: ["string", "null"],
      description: "When the SLA clock started.",
    },
    sortOrder: {
      type: ["number", "null"],
      description: "Board column sort order.",
    },
    startedAt: { type: ["string", "null"], description: "When work started." },
    startedTriageAt: {
      type: ["string", "null"],
      description: "When the issue entered started-triage.",
    },
    state: {
      type: "object",
      description:
        "Current workflow state (inlined WorkflowStateChildWebhookPayload).",
      required: ["color", "id", "name", "type"],
      properties: {
        color: { type: "string", description: "State color." },
        id: { type: "string", description: "State ID." },
        name: { type: "string", description: "State name." },
        type: {
          type: "string",
          description:
            "State category/type (e.g., triage, backlog, inProgress, done, canceled).",
        },
      },
    },
    stateId: { type: "string", description: "Workflow state ID." },
    subIssueSortOrder: {
      type: ["number", "null"],
      description: "Sort order among siblings if this is a sub-issue.",
    },
    subscriberIds: {
      type: "array",
      description: "User IDs subscribed to the issue.",
      items: { type: "string" },
    },
    syncedWith: {
      type: ["object", "null"],
      description:
        "Data describing linked external entity (shape varies by integration).",
    },
    team: {
      type: "object",
      description: "Team (inlined TeamChildWebhookPayload).",
      required: ["id", "key", "name"],
      properties: {
        id: { type: "string", description: "Team ID." },
        key: { type: "string", description: "Team key." },
        name: { type: "string", description: "Team name." },
      },
    },
    teamId: { type: "string", description: "Team ID." },
    title: { type: "string", description: "Issue title." },
    trashed: {
      type: ["boolean", "null"],
      description: "Whether the issue is in trash.",
    },
    triagedAt: {
      type: ["string", "null"],
      description: "When the issue was triaged.",
    },
    updatedAt: { type: "string", description: "Last update timestamp." },
    url: { type: "string", description: "Issue URL." },
  },
};
