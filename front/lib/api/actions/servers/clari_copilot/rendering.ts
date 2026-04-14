import type {
  ClariCall,
  ClariCallDetails,
} from "@app/lib/api/actions/servers/clari_copilot/types";

function formatDurationSeconds(durationSeconds: number): string {
  const minutes = Math.floor(durationSeconds / 60);
  const remainingSeconds = durationSeconds % 60;
  return `${minutes}m${remainingSeconds > 0 ? `${remainingSeconds}s` : ""}`;
}

function formatTimestamp(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function renderCallList(calls: ClariCall[]): string {
  if (calls.length === 0) {
    return "No calls found matching the criteria.";
  }

  const lines: string[] = [`Found ${calls.length} call(s):\n`];

  for (const call of calls) {
    const parts: string[] = [];
    parts.push(`**${call.title ?? "Untitled call"}**`);
    parts.push(`- ID: ${call.id}`);

    if (call.time) {
      parts.push(`- Date: ${formatTimestamp(call.time)}`);
    }
    if (call.account_name) {
      parts.push(`- Account: ${call.account_name}`);
    }
    if (call.contact_names && call.contact_names.length > 0) {
      parts.push(`- Contacts: ${call.contact_names.join(", ")}`);
    }
    if (call.users && call.users.length > 0) {
      const emails = call.users.map((u) => u.userEmail).filter(Boolean);
      if (emails.length > 0) {
        parts.push(`- Internal participants: ${emails.join(", ")}`);
      }
    }
    if (call.metrics?.call_duration) {
      parts.push(
        `- Duration: ${formatDurationSeconds(call.metrics.call_duration)}`
      );
    }
    if (call.call_review_page_url) {
      parts.push(`- Review: ${call.call_review_page_url}`);
    }

    lines.push(parts.join("\n"));
  }

  return lines.join("\n");
}

export function renderCallDetails(call: ClariCallDetails): string {
  const sections: string[] = [];

  // Header
  const headerParts: string[] = [`**${call.title ?? "Untitled call"}**`];
  headerParts.push(`- ID: ${call.id}`);
  if (call.time) {
    headerParts.push(`- Date: ${formatTimestamp(call.time)}`);
  }
  if (call.account_name) {
    headerParts.push(`- Account: ${call.account_name}`);
  }
  if (call.metrics?.call_duration) {
    headerParts.push(
      `- Duration: ${formatDurationSeconds(call.metrics.call_duration)}`
    );
  }
  if (call.call_review_page_url) {
    headerParts.push(`- Review URL: ${call.call_review_page_url}`);
  }
  sections.push(headerParts.join("\n"));

  // Summary
  if (call.summary?.full_summary) {
    sections.push(`## Summary\n${call.summary.full_summary}`);
  }

  // Topics discussed
  if (
    call.summary?.topics_discussed &&
    call.summary.topics_discussed.length > 0
  ) {
    const topicLines = call.summary.topics_discussed
      .map((t) => {
        const header = t.name ? `**${t.name}**` : "**Topic**";
        return t.summary ? `${header}\n${t.summary}` : header;
      })
      .join("\n\n");
    sections.push(`## Topics Discussed\n${topicLines}`);
  }

  // Action items
  if (
    call.summary?.key_action_items &&
    call.summary.key_action_items.length > 0
  ) {
    const actionLines = call.summary.key_action_items
      .map((a) => {
        const speaker = a.speaker_name ? `${a.speaker_name}: ` : "";
        return `- ${speaker}${a.action_item ?? ""}`;
      })
      .join("\n");
    sections.push(`## Action Items\n${actionLines}`);
  }

  // Competitor mentions
  if (call.competitor_sentiments && call.competitor_sentiments.length > 0) {
    const competitorLines = call.competitor_sentiments
      .map((c) => {
        const parts = [`- ${c.competitor_name ?? "Unknown"}`];
        if (c.sentiment) {
          parts.push(`sentiment: ${c.sentiment}`);
        }
        if (c.reasoning) {
          parts.push(`— ${c.reasoning}`);
        }
        return parts.join(" ");
      })
      .join("\n");
    sections.push(`## Competitor Mentions\n${competitorLines}`);
  }

  // Transcript
  if (call.transcript && call.transcript.length > 0) {
    // Build speaker name lookup from users + externalParticipants by personId.
    const speakerMap = new Map<string, string>();
    for (const u of call.users ?? []) {
      if (u.personId) {
        speakerMap.set(u.personId, u.userEmail ?? u.personId);
      }
    }
    for (const p of call.externalParticipants ?? []) {
      if (p.personId) {
        speakerMap.set(p.personId, p.name ?? p.email ?? p.personId);
      }
    }

    const transcriptLines = call.transcript
      .map((turn) => {
        const speaker = turn.personId
          ? (speakerMap.get(turn.personId) ?? turn.personId)
          : "Unknown";
        return `**${speaker}:** ${turn.text}`;
      })
      .join("\n\n");

    sections.push(`## Transcript\n${transcriptLines}`);
  }

  return sections.join("\n\n");
}
