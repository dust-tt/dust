import type { Incident } from "@app/lib/api/actions/servers/servicenow/client";

export function renderIncident(incident: Incident): string {
  let text = `- **${incident.number}**: ${incident.short_description || "(no description)"}`;
  text += `\n  - State: ${incident.state || "unknown"}`;
  text += `\n  - Priority: ${incident.priority || "unknown"}`;
  text += `\n  - Opened: ${incident.opened_at || "unknown"}`;
  return text;
}
