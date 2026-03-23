import type {
  LumaEvent,
  LumaGuest,
  LumaTicketType,
  LumaUser,
} from "@app/lib/api/actions/servers/luma/types";

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) {
    return "N/A";
  }
  return new Date(dateString).toISOString();
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function renderEvent(event: LumaEvent): string {
  const lines = [`**${event.name}**`, `- ID: ${event.api_id}`];

  lines.push(`- Start: ${formatDate(event.start_at)}`);
  if (event.end_at) {
    lines.push(`- End: ${formatDate(event.end_at)}`);
  }
  lines.push(`- Timezone: ${event.timezone}`);
  if (event.visibility) {
    lines.push(`- Visibility: ${event.visibility}`);
  }
  if (event.max_capacity !== null) {
    lines.push(`- Capacity: ${event.max_capacity}`);
  }
  if (event.url) {
    lines.push(`- URL: ${event.url}`);
  }
  if (event.slug) {
    lines.push(`- Slug: ${event.slug}`);
  }
  if (event.geo_address_info?.full_address) {
    lines.push(`- Location: ${event.geo_address_info.full_address}`);
  }

  return lines.join("\n");
}

export function renderEventList(
  events: LumaEvent[],
  nextCursor: string | null
): string {
  if (events.length === 0) {
    return "No events found.";
  }

  const header = `# Events (${events.length})\n\n`;
  const body = events.map(renderEvent).join("\n\n---\n\n");
  const pagination = nextCursor
    ? `\n\n---\n\n*More events available. Use cursor \`${nextCursor}\` to load next page.*`
    : "";

  return header + body + pagination;
}

export function renderGuest(guest: LumaGuest): string {
  const lines = [`**${guest.name ?? "Unknown"}**`, `- ID: ${guest.api_id}`];

  if (guest.email) {
    lines.push(`- Email: ${guest.email}`);
  }
  lines.push(`- Status: ${formatStatus(guest.approval_status)}`);
  if (guest.registered_at) {
    lines.push(`- Registered: ${formatDate(guest.registered_at)}`);
  }
  if (guest.checked_in_at) {
    lines.push(`- Checked in: ${formatDate(guest.checked_in_at)}`);
  }

  return lines.join("\n");
}

export function renderGuestList(
  guests: LumaGuest[],
  nextCursor: string | null
): string {
  if (guests.length === 0) {
    return "No guests found.";
  }

  const header = `# Guests (${guests.length})\n\n`;
  const body = guests.map(renderGuest).join("\n\n---\n\n");
  const pagination = nextCursor
    ? `\n\n---\n\n*More guests available. Use cursor \`${nextCursor}\` to load next page.*`
    : "";

  return header + body + pagination;
}

export function renderEventInsights(
  event: LumaEvent,
  guests: LumaGuest[],
  ticketTypes: LumaTicketType[]
): string {
  const statusCounts = new Map<string, number>();
  let checkedInCount = 0;
  const registrationByDay = new Map<string, number>();

  for (const guest of guests) {
    statusCounts.set(
      guest.approval_status,
      (statusCounts.get(guest.approval_status) ?? 0) + 1
    );

    if (guest.checked_in_at) {
      checkedInCount++;
    }

    if (guest.registered_at) {
      const day = guest.registered_at.slice(0, 10);
      registrationByDay.set(day, (registrationByDay.get(day) ?? 0) + 1);
    }
  }

  const approved = statusCounts.get("approved") ?? 0;
  const pending = statusCounts.get("pending_approval") ?? 0;
  const waitlisted = statusCounts.get("waitlist") ?? 0;
  const declined = statusCounts.get("declined") ?? 0;
  const invited = statusCounts.get("invited") ?? 0;
  const checkinRate =
    approved > 0 ? ((checkedInCount / approved) * 100).toFixed(1) : "0.0";

  const lines = [
    `**${event.name}** — ${formatDate(event.start_at)}`,
    "",
    `- Total registered: ${guests.length}`,
    `- Approved: ${approved} | Pending: ${pending} | Waitlisted: ${waitlisted} | Declined: ${declined} | Invited: ${invited}`,
    `- Checked in: ${checkedInCount} (${checkinRate}% of approved)`,
  ];

  if (registrationByDay.size > 0) {
    const sortedDays = [...registrationByDay.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    );
    const dayEntries = sortedDays.map(([day, count]) => `${day}: ${count}`);
    lines.push(`- Registration by day: ${dayEntries.join(" | ")}`);
  }

  if (ticketTypes.length > 0) {
    const ticketEntries = ticketTypes.map((t) => {
      const priceLabel =
        t.type === "free"
          ? "free"
          : `${t.currency ?? ""} ${(t.cents ?? 0) / 100}`.trim();
      const capacityLabel =
        t.max_capacity !== null && t.max_capacity !== undefined
          ? `, capacity: ${t.max_capacity}`
          : "";
      return `${t.name} (${priceLabel}${capacityLabel})`;
    });
    lines.push(`- Ticket breakdown: ${ticketEntries.join(" | ")}`);
  }

  return lines.join("\n");
}

export function renderUser(user: LumaUser): string {
  const lines = [`**${user.name ?? "Unknown"}**`, `- ID: ${user.api_id}`];

  if (user.email) {
    lines.push(`- Email: ${user.email}`);
  }

  return lines.join("\n");
}
