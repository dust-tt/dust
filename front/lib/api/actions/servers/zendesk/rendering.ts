import type {
  ZendeskTicket,
  ZendeskTicketComment,
  ZendeskTicketField,
  ZendeskTicketMetrics,
  ZendeskUser,
} from "@app/lib/api/actions/servers/zendesk/types";
import type { Result } from "@app/types/shared/result";

function apiUrlToDocumentUrl(apiUrl: string): string {
  return apiUrl.replace("/api/v2", "").replace(".json", "");
}

function formatFieldValue(value: NonNullable<unknown>): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (value instanceof Object) {
    return JSON.stringify(value);
  }
  return String(value);
}

export function renderTicket(
  ticket: ZendeskTicket,
  includeFields: string[] = []
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
    const quoted = ticket.description
      .split("\n")
      .map((l) => `   > ${l}`)
      .join("\n");
    lines.push(`- Description:\n${quoted}`);
  }

  lines.push(`- Created: ${new Date(ticket.created_at).toISOString()}`);
  lines.push(`- Updated: ${new Date(ticket.updated_at).toISOString()}`);

  const extraFields = includeFields.filter((f) => f !== "custom_fields");
  const ticketRecord = Object.fromEntries(Object.entries(ticket));
  for (const field of extraFields) {
    const value = ticketRecord[field];
    if (value !== null && value !== undefined) {
      lines.push(`- ${field}: ${formatFieldValue(value)}`);
    }
  }

  return lines.join("\n");
}

export function renderCustomFields(
  ticket: ZendeskTicket,
  ticketFieldsResult: Result<ZendeskTicketField[], Error>
): string {
  if (!ticket.custom_fields || ticket.custom_fields.length === 0) {
    return "";
  }

  if (ticketFieldsResult.isErr()) {
    return "\n- Custom Fields: (names could not be retrieved)";
  }

  const fieldMap = new Map(
    ticketFieldsResult.value.map((f) => [f.id, f.title])
  );
  const lines: string[] = [];

  for (const field of ticket.custom_fields) {
    if (field.value !== null && field.value !== "") {
      const fieldName = fieldMap.get(field.id);
      if (fieldName) {
        const valueStr = Array.isArray(field.value)
          ? field.value.join(", ")
          : String(field.value);
        lines.push(`- Custom Fields — ${fieldName}: ${valueStr}`);
      }
    }
  }

  return lines.length > 0 ? "\n" + lines.join("\n") : "";
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
