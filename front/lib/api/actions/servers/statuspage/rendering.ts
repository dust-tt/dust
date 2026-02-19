import type {
  StatuspageComponent,
  StatuspageIncident,
  StatuspagePage,
} from "@app/lib/api/actions/servers/statuspage/types";

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return "N/A";
  }
  return new Date(dateString).toISOString();
}

export function renderPage(page: StatuspagePage): string {
  const lines = [`**${page.name}**`, `- ID: ${page.id}`];

  if (page.url) {
    lines.push(`- URL: ${page.url}`);
  }
  if (page.subdomain) {
    lines.push(`- Subdomain: ${page.subdomain}`);
  }
  if (page.page_description) {
    lines.push(`- Description: ${page.page_description}`);
  }

  return lines.join("\n");
}

export function renderPagesList(pages: StatuspagePage[]): string {
  if (pages.length === 0) {
    return "No status pages found.";
  }

  const header = `# Status Pages (${pages.length})\n\n`;
  return header + pages.map(renderPage).join("\n\n---\n\n");
}

export function renderComponent(component: StatuspageComponent): string {
  const lines = [
    `**${component.name}**`,
    `- ID: ${component.id}`,
    `- Status: ${formatStatus(component.status)}`,
    `- Position: ${component.position}`,
  ];

  if (component.description) {
    lines.push(`- Description: ${component.description}`);
  }
  if (component.group_id) {
    lines.push(`- Group ID: ${component.group_id}`);
  }

  return lines.join("\n");
}

export function renderComponentsList(
  components: StatuspageComponent[]
): string {
  if (components.length === 0) {
    return "No components found.";
  }

  const header = `# Components (${components.length})\n\n`;
  return header + components.map(renderComponent).join("\n\n---\n\n");
}

export function renderIncidentSummary(incident: StatuspageIncident): string {
  const lines = [
    `**${incident.name}**`,
    `- ID: ${incident.id}`,
    `- Status: ${formatStatus(incident.status)}`,
  ];

  if (incident.impact) {
    lines.push(`- Impact: ${formatStatus(incident.impact)}`);
  }
  if (incident.shortlink) {
    lines.push(`- Link: ${incident.shortlink}`);
  }
  lines.push(`- Created: ${formatDate(incident.created_at)}`);
  if (incident.resolved_at) {
    lines.push(`- Resolved: ${formatDate(incident.resolved_at)}`);
  }

  return lines.join("\n");
}

export function renderIncidentsList(incidents: StatuspageIncident[]): string {
  if (incidents.length === 0) {
    return "No incidents found.";
  }

  const header = `# Incidents (${incidents.length})\n\n`;
  return header + incidents.map(renderIncidentSummary).join("\n\n---\n\n");
}

export function renderIncidentDetails(incident: StatuspageIncident): string {
  const lines = [
    `# Incident: ${incident.name}`,
    "",
    `**ID:** ${incident.id}`,
    `**Status:** ${formatStatus(incident.status)}`,
  ];

  if (incident.impact) {
    lines.push(`**Impact:** ${formatStatus(incident.impact)}`);
  }
  if (incident.shortlink) {
    lines.push(`**Link:** ${incident.shortlink}`);
  }
  lines.push(`**Created:** ${formatDate(incident.created_at)}`);
  lines.push(`**Updated:** ${formatDate(incident.updated_at)}`);
  if (incident.started_at) {
    lines.push(`**Started:** ${formatDate(incident.started_at)}`);
  }
  if (incident.monitoring_at) {
    lines.push(`**Monitoring since:** ${formatDate(incident.monitoring_at)}`);
  }
  if (incident.resolved_at) {
    lines.push(`**Resolved:** ${formatDate(incident.resolved_at)}`);
  }

  // Affected components
  if (incident.components && incident.components.length > 0) {
    lines.push("");
    lines.push("## Affected Components");
    for (const component of incident.components) {
      lines.push(`- ${component.name} (${formatStatus(component.status)})`);
    }
  }

  // Incident updates
  if (incident.incident_updates && incident.incident_updates.length > 0) {
    lines.push("");
    lines.push("## Updates Timeline");
    for (const update of incident.incident_updates) {
      lines.push("");
      lines.push(
        `### ${formatStatus(update.status)} - ${formatDate(update.created_at)}`
      );
      if (update.body) {
        lines.push(update.body);
      }
    }
  }

  return lines.join("\n");
}
