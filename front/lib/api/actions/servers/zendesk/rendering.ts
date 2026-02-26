import type { TicketOptionalField } from "@app/lib/api/actions/servers/zendesk/metadata";
import type {
  ZendeskTicket,
  ZendeskTicketComment,
  ZendeskTicketField,
  ZendeskTicketMetrics,
  ZendeskUser,
} from "@app/lib/api/actions/servers/zendesk/types";
import type { Result } from "@app/types/shared/result";

export const MAX_CUSTOM_FIELDS = 50;

function apiUrlToDocumentUrl(apiUrl: string): string {
  return apiUrl.replace("/api/v2", "").replace(".json", "");
}

export function renderTicket(
  ticket: ZendeskTicket,
  ticketFieldsResult: Result<ZendeskTicketField[], Error>,
  fields: TicketOptionalField[] = []
): string {
  const lines = [
    `## Ticket ID: ${ticket.id}`,
    `- URL: ${apiUrlToDocumentUrl(ticket.url)}`,
    `- Subject: ${ticket.subject ?? "No subject"}`,
    `- Status: ${ticket.status}`,
  ];

  if (ticket.priority) {
    lines.push(`- Priority: ${ticket.priority}`);
  }

  if (ticket.description) {
    lines.push(`- Description: ${ticket.description}`);
  }

  lines.push(`- Created: ${new Date(ticket.created_at).toISOString()}`);
  lines.push(`- Updated: ${new Date(ticket.updated_at).toISOString()}`);

  // Optional fields.
  if (fields.includes("type") && ticket.type) {
    lines.push(`- Type: ${ticket.type}`);
  }
  if (fields.includes("requester_id")) {
    lines.push(`- Requester ID: ${ticket.requester_id}`);
  }
  if (fields.includes("submitter_id")) {
    lines.push(`- Submitter ID: ${ticket.submitter_id}`);
  }
  if (fields.includes("assignee_id")) {
    lines.push(`- Assignee ID: ${ticket.assignee_id ?? "Unassigned"}`);
  }
  if (fields.includes("group_id")) {
    lines.push(`- Group ID: ${ticket.group_id ?? "None"}`);
  }
  if (fields.includes("organization_id")) {
    lines.push(`- Organization ID: ${ticket.organization_id ?? "None"}`);
  }
  if (fields.includes("brand_id") && ticket.brand_id !== undefined) {
    lines.push(`- Brand ID: ${ticket.brand_id}`);
  }
  if (fields.includes("tags") && ticket.tags?.length) {
    lines.push(`- Tags: ${ticket.tags.join(", ")}`);
  }
  if (fields.includes("via") && ticket.via) {
    lines.push(`- Channel: ${ticket.via.channel}`);
  }
  if (fields.includes("due_at")) {
    lines.push(
      `- Due At: ${ticket.due_at ? new Date(ticket.due_at).toISOString() : "None"}`
    );
  }
  if (fields.includes("has_incidents")) {
    lines.push(`- Has Incidents: ${ticket.has_incidents}`);
  }
  if (fields.includes("problem_id") && ticket.problem_id !== undefined) {
    lines.push(`- Problem ID: ${ticket.problem_id ?? "None"}`);
  }
  if (fields.includes("external_id") && ticket.external_id !== undefined) {
    lines.push(`- External ID: ${ticket.external_id ?? "None"}`);
  }
  if (
    fields.includes("custom_status_id") &&
    ticket.custom_status_id !== undefined
  ) {
    lines.push(`- Custom Status ID: ${ticket.custom_status_id ?? "None"}`);
  }
  if (fields.includes("satisfaction_rating") && ticket.satisfaction_rating) {
    lines.push(`- Satisfaction: ${ticket.satisfaction_rating.score}`);
    if (ticket.satisfaction_rating.comment) {
      lines.push(
        `- Satisfaction Comment: ${ticket.satisfaction_rating.comment}`
      );
    }
  }
  if (fields.includes("collaborator_ids") && ticket.collaborator_ids?.length) {
    lines.push(`- Collaborator IDs: ${ticket.collaborator_ids.join(", ")}`);
  }
  if (fields.includes("follower_ids") && ticket.follower_ids?.length) {
    lines.push(`- Follower IDs: ${ticket.follower_ids.join(", ")}`);
  }
  if (fields.includes("email_cc_ids") && ticket.email_cc_ids?.length) {
    lines.push(`- Email CC IDs: ${ticket.email_cc_ids.join(", ")}`);
  }

  if (fields.includes("custom_fields") && ticket.custom_fields?.length) {
    if (ticketFieldsResult.isErr()) {
      lines.push("- Custom Fields: (names could not be retrieved)");
    } else {
      const fieldMap = new Map(
        ticketFieldsResult.value.map((f) => [f.id, f.title])
      );
      const validFields = ticket.custom_fields.filter(
        (field) =>
          field.value !== null && field.value !== "" && fieldMap.has(field.id)
      );
      for (const field of validFields.slice(0, MAX_CUSTOM_FIELDS)) {
        const valueStr = Array.isArray(field.value)
          ? field.value.join(", ")
          : String(field.value);
        lines.push(`- Custom Fields — ${fieldMap.get(field.id)}: ${valueStr}`);
      }
      if (validFields.length > MAX_CUSTOM_FIELDS) {
        lines.push(
          `- Custom Fields: display limit reached (${MAX_CUSTOM_FIELDS} shown). There may be more custom fields available.`
        );
      }
    }
  }

  return lines.join("\n");
}

function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes === 0) {
    return "0 minutes";
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours === 0) {
    return `${mins} minute${mins !== 1 ? "s" : ""}`;
  }

  if (mins === 0) {
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  return `${hours} hour${hours !== 1 ? "s" : ""} ${mins} minute${mins !== 1 ? "s" : ""}`;
}

export function renderTicketMetrics(metrics: ZendeskTicketMetrics): string {
  const lines = ["\n## Metrics"];

  lines.push(`- Reopens: ${metrics.reopens}`);
  lines.push(`- Replies: ${metrics.replies}`);
  lines.push(`- Assignee Stations: ${metrics.assignee_stations}`);
  lines.push(`- Group Stations: ${metrics.group_stations}`);

  if (metrics.reply_time_in_minutes) {
    lines.push(
      `- Reply Time: ${formatMinutes(metrics.reply_time_in_minutes.calendar)}`
    );
  }

  if (metrics.first_resolution_time_in_minutes?.calendar) {
    lines.push(
      `- First Resolution Time: ${formatMinutes(metrics.first_resolution_time_in_minutes.calendar)}`
    );
  }

  if (metrics.full_resolution_time_in_minutes?.calendar) {
    lines.push(
      `- Full Resolution Time: ${formatMinutes(metrics.full_resolution_time_in_minutes.calendar)}`
    );
  }

  if (metrics.agent_wait_time_in_minutes?.calendar) {
    lines.push(
      `- Agent Wait Time: ${formatMinutes(metrics.agent_wait_time_in_minutes.calendar)}`
    );
  }

  if (metrics.requester_wait_time_in_minutes?.calendar) {
    lines.push(
      `- Requester Wait Time: ${formatMinutes(metrics.requester_wait_time_in_minutes.calendar)}`
    );
  }

  if (metrics.on_hold_time_in_minutes?.calendar) {
    lines.push(
      `- On Hold Time: ${formatMinutes(metrics.on_hold_time_in_minutes.calendar)}`
    );
  }

  if (metrics.assigned_at) {
    lines.push(`- Assigned At: ${new Date(metrics.assigned_at).toISOString()}`);
  }

  if (metrics.solved_at) {
    lines.push(`- Solved At: ${new Date(metrics.solved_at).toISOString()}`);
  }

  if (metrics.initially_assigned_at) {
    lines.push(
      `- Initially Assigned At: ${new Date(metrics.initially_assigned_at).toISOString()}`
    );
  }

  return lines.join("\n");
}

export function renderTicketComments(
  comments: ZendeskTicketComment[],
  users: ZendeskUser[] = []
): string {
  if (comments.length === 0) {
    return "\n## Conversation\n\nNo comments found.";
  }

  const lines = ["\n## Conversation"];

  const sortedComments = [...comments].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  for (const comment of sortedComments) {
    const date = new Date(comment.created_at).toISOString();
    const body = comment.plain_body ?? comment.body;
    const author = users.find((user) => user.id === comment.author_id) ?? null;
    const authorLabel = author
      ? `${author.name} (${author.email ?? "Unknown email"})`
      : `Unknown User (ID: ${comment.author_id})`;
    lines.push(`\n[${date}] ${authorLabel}:\n${body}`);
  }

  return lines.join("\n");
}

export function renderTicketFields(fields: ZendeskTicketField[]): string {
  if (fields.length === 0) {
    return "No ticket fields found.";
  }

  const lines = [`Found ${fields.length} ticket field(s):\n`];

  for (const field of fields) {
    lines.push(
      `- ID: ${field.id} | Title: ${field.title} | Type: ${field.type} | Active: ${field.active}`
    );
  }

  return lines.join("\n") + "\n";
}
