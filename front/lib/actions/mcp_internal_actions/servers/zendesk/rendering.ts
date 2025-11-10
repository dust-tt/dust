import type { ZendeskTicket } from "@app/lib/actions/mcp_internal_actions/servers/zendesk/types";

function apiUrlToDocumentUrl(apiUrl: string): string {
  return apiUrl.replace("/api/v2", "").replace(".json", "");
}

export function renderTicket(ticket: ZendeskTicket): string {
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

  return lines.join("\n");
}
