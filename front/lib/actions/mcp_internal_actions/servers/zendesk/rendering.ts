import type {
  ZendeskTicket,
  ZendeskTicketComment,
  ZendeskTicketField,
  ZendeskTicketMetrics,
  ZendeskUser,
} from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";
import type { Result } from "@app/types";

function apiUrlToDocumentUrl(apiUrl: string): string {
  return apiUrl.replace("/api/v2", "").replace(".json", "");
}

export function renderTicket(
  ticket: ZendeskTicket,
  ticketFieldsResult: Result<ZendeskTicketField[], Error>
): string {
  const lines = [
    `ID: ${ticket.id}`,
    `URL: ${apiUrlToDocumentUrl(ticket.url)}`,
    `Subject: ${ticket.subject ?? "No subject"}`,
    `Status: ${ticket.status}`,
  ];

  if (ticket.priority) {
    lines.push(`Priority: ${ticket.priority}`);
  }

  if (ticket.type) {
    lines.push(`Type: ${ticket.type}`);
  }

  if (ticket.description) {
    lines.push(`\nDescription:\n${ticket.description}`);
  }

  if (ticket.requester_id) {
    lines.push(`\nRequester ID: ${ticket.requester_id}`);
  }

  if (ticket.assignee_id) {
    lines.push(`Assignee ID: ${ticket.assignee_id}`);
  }

  if (ticket.group_id) {
    lines.push(`Group ID: ${ticket.group_id}`);
  }

  if (ticket.organization_id) {
    lines.push(`Organization ID: ${ticket.organization_id}`);
  }

  if (ticket.tags.length > 0) {
    lines.push(`\nTags: ${ticket.tags.join(", ")}`);
  }

  if (ticket.via?.channel) {
    lines.push(`\nChannel: ${ticket.via.channel}`);
  }

  lines.push(`\nCreated: ${new Date(ticket.created_at).toISOString()}`);
  lines.push(`Updated: ${new Date(ticket.updated_at).toISOString()}`);

  if (ticket.custom_fields && ticket.custom_fields.length > 0) {
    if (ticketFieldsResult.isErr()) {
      lines.push(
        "\nNote: Custom field names could not be retrieved. Only field IDs would be shown if displayed."
      );
    } else {
      const fieldMap = new Map(
        ticketFieldsResult.value.map((f) => [f.id, f.title])
      );
      const fieldsWithNames: string[] = [];
      let fieldsAreMissing = false;

      for (const field of ticket.custom_fields) {
        if (field.value !== null && field.value !== "") {
          const fieldName = fieldMap.get(field.id);
          if (fieldName) {
            const valueStr = Array.isArray(field.value)
              ? field.value.join(", ")
              : String(field.value);
            fieldsWithNames.push(`- ${fieldName}: ${valueStr}`);
          } else {
            fieldsAreMissing = true;
          }
        }
      }

      if (fieldsWithNames.length > 0) {
        lines.push("\nCustom Fields:");
        lines.push(...fieldsWithNames);
      }

      if (fieldsAreMissing) {
        lines.push("\nNote: Some custom fields could not be displayed.");
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

  lines.push(`Reopens: ${metrics.reopens}`);
  lines.push(`Replies: ${metrics.replies}`);
  lines.push(`Assignee Stations: ${metrics.assignee_stations}`);
  lines.push(`Group Stations: ${metrics.group_stations}`);

  if (metrics.reply_time_in_minutes) {
    lines.push(
      `\nReply Time: ${formatMinutes(metrics.reply_time_in_minutes.calendar)}`
    );
  }

  if (metrics.first_resolution_time_in_minutes?.calendar) {
    lines.push(
      `\nFirst Resolution Time: ${formatMinutes(metrics.first_resolution_time_in_minutes.calendar)}`
    );
  }

  if (metrics.full_resolution_time_in_minutes?.calendar) {
    lines.push(
      `\nFull Resolution Time: ${formatMinutes(metrics.full_resolution_time_in_minutes.calendar)}`
    );
  }

  if (metrics.agent_wait_time_in_minutes?.calendar) {
    lines.push(
      `\nAgent Wait Time: ${formatMinutes(metrics.agent_wait_time_in_minutes.calendar)}`
    );
  }

  if (metrics.requester_wait_time_in_minutes?.calendar) {
    lines.push(
      `\nRequester Wait Time: ${formatMinutes(metrics.requester_wait_time_in_minutes.calendar)}`
    );
  }

  if (metrics.on_hold_time_in_minutes?.calendar) {
    lines.push(
      `\nOn Hold Time: ${formatMinutes(metrics.on_hold_time_in_minutes.calendar)}`
    );
  }

  if (metrics.assigned_at) {
    lines.push(`\nAssigned At: ${new Date(metrics.assigned_at).toISOString()}`);
  }

  if (metrics.solved_at) {
    lines.push(`Solved At: ${new Date(metrics.solved_at).toISOString()}`);
  }

  if (metrics.initially_assigned_at) {
    lines.push(
      `Initially Assigned At: ${new Date(metrics.initially_assigned_at).toISOString()}`
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
