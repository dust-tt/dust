import type {
  GongCall,
  GongCallTranscript,
} from "@app/lib/api/actions/servers/gong/schemas";

function formatDuration(durationSeconds: number | undefined): string {
  if (!durationSeconds) {
    return "Unknown duration";
  }
  const minutes = Math.floor(durationSeconds / 60);
  const remainingSeconds = durationSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m ${remainingSeconds}s`;
  }
  return `${minutes}m ${remainingSeconds}s`;
}

function formatDateTime(dateString: string | undefined): string {
  if (!dateString) {
    return "Unknown date";
  }
  try {
    const date = new Date(dateString);
    return date.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return dateString;
  }
}

export function renderCall(call: GongCall, includeDetails = false): string {
  const lines: string[] = [];

  lines.push(`## ${call.title ?? "Untitled Call"}`);
  lines.push(`- **ID:** ${call.id}`);

  if (call.url) {
    lines.push(`- **URL:** ${call.url}`);
  }
  if (call.started) {
    lines.push(`- **Started:** ${formatDateTime(call.started)}`);
  }
  if (call.duration) {
    lines.push(`- **Duration:** ${formatDuration(call.duration)}`);
  }
  if (call.direction) {
    lines.push(`- **Direction:** ${call.direction}`);
  }
  if (call.scope) {
    lines.push(`- **Scope:** ${call.scope}`);
  }
  if (call.media) {
    lines.push(`- **Media Type:** ${call.media}`);
  }
  if (call.language) {
    lines.push(`- **Language:** ${call.language}`);
  }
  if (call.purpose) {
    lines.push(`- **Purpose:** ${call.purpose}`);
  }

  // Render parties
  if (call.parties && call.parties.length > 0) {
    lines.push("\n### Participants");
    for (const party of call.parties) {
      const partyName = party.name ?? party.emailAddress ?? "Unknown";
      const affiliation = party.affiliation ? ` (${party.affiliation})` : "";
      const title = party.title ? ` - ${party.title}` : "";
      lines.push(`- ${partyName}${title}${affiliation}`);
    }
  }

  if (includeDetails) {
    // Content summary
    if (call.content) {
      if (call.content.brief) {
        lines.push("\n### Summary");
        lines.push(call.content.brief);
      }

      if (call.content.keyPoints && call.content.keyPoints.length > 0) {
        lines.push("\n### Key Points");
        for (const point of call.content.keyPoints) {
          if (point.text) {
            lines.push(`- ${point.text}`);
          }
        }
      }

      if (call.content.topics && call.content.topics.length > 0) {
        lines.push("\n### Topics Discussed");
        for (const topic of call.content.topics) {
          const duration = topic.duration
            ? ` (${formatDuration(topic.duration)})`
            : "";
          lines.push(`- ${topic.name}${duration}`);
        }
      }

      if (call.content.callOutcome) {
        lines.push("\n### Call Outcome");
        lines.push(
          `- **Category:** ${call.content.callOutcome.category ?? "N/A"}`
        );
        lines.push(`- **Outcome:** ${call.content.callOutcome.name ?? "N/A"}`);
      }

      if (
        call.content.pointsOfInterest?.actionItems &&
        call.content.pointsOfInterest.actionItems.length > 0
      ) {
        lines.push("\n### Action Items");
        for (const item of call.content.pointsOfInterest.actionItems) {
          if (item.snippet) {
            lines.push(`- ${item.snippet}`);
          }
        }
      }
    }

    // Interaction stats
    if (call.interaction?.interactionStats) {
      lines.push("\n### Interaction Stats");
      for (const stat of call.interaction.interactionStats) {
        if (stat.name && stat.value !== undefined) {
          lines.push(`- **${stat.name}:** ${stat.value}`);
        }
      }
    }

    // Public comments
    if (
      call.collaboration?.publicComments &&
      call.collaboration.publicComments.length > 0
    ) {
      lines.push("\n### Comments");
      for (const comment of call.collaboration.publicComments) {
        if (comment.comment) {
          const posted = comment.posted
            ? ` (${formatDateTime(comment.posted)})`
            : "";
          lines.push(`- ${comment.comment}${posted}`);
        }
      }
    }
  }

  return lines.join("\n");
}

export function renderCalls(calls: GongCall[], includeDetails = false): string {
  if (calls.length === 0) {
    return "No calls found.";
  }

  return calls
    .map((call) => renderCall(call, includeDetails))
    .join("\n\n---\n\n");
}

export function renderTranscript(transcript: GongCallTranscript): string {
  const lines: string[] = [];

  lines.push(`## Transcript for Call ${transcript.callId}`);
  lines.push("");

  if (transcript.transcript.length === 0) {
    lines.push("No transcript available.");
    return lines.join("\n");
  }

  // Each segment has a speakerId and sentences array
  for (const segment of transcript.transcript) {
    const speakerLabel = segment.speakerId
      ? `Speaker ${segment.speakerId}`
      : "Unknown Speaker";
    const topicLabel = segment.topic ? ` [${segment.topic}]` : "";

    if (!segment.sentences || segment.sentences.length === 0) {
      continue;
    }

    const text = segment.sentences
      .filter((s) => s.text)
      .map((s) => s.text)
      .join(" ");

    if (text) {
      lines.push(`**${speakerLabel}${topicLabel}:**`);
      lines.push(text);
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function renderTranscripts(transcripts: GongCallTranscript[]): string {
  if (transcripts.length === 0) {
    return "No transcripts found.";
  }

  return transcripts.map(renderTranscript).join("\n\n---\n\n");
}
