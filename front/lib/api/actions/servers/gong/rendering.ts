import type {
  GongCall,
  GongCallTranscript,
  GongUser,
} from "@app/lib/api/actions/servers/gong/client";

function formatDuration(seconds: number | undefined): string {
  if (!seconds) {
    return "Unknown duration";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
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

export function renderUser(user: GongUser): string {
  const lines: string[] = [];

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  lines.push(`## ${name || "User"}`);
  lines.push(`- **ID:** ${user.id}`);
  lines.push(`- **Email:** ${user.emailAddress}`);

  if (user.title) {
    lines.push(`- **Title:** ${user.title}`);
  }
  if (user.phoneNumber) {
    lines.push(`- **Phone:** ${user.phoneNumber}`);
  }
  if (user.active !== undefined) {
    lines.push(`- **Active:** ${user.active ? "Yes" : "No"}`);
  }
  if (user.managerId) {
    lines.push(`- **Manager ID:** ${user.managerId}`);
  }
  if (user.created) {
    lines.push(`- **Created:** ${formatDateTime(user.created)}`);
  }

  return lines.join("\n");
}

export function renderUsers(users: GongUser[]): string {
  if (users.length === 0) {
    return "No users found.";
  }

  return users.map(renderUser).join("\n\n---\n\n");
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

  // Group sentences by speaker for readability
  let currentSpeaker: string | undefined;
  let currentBlock: string[] = [];

  const flushBlock = () => {
    if (currentBlock.length > 0) {
      const speakerLabel = currentSpeaker ?? "Unknown Speaker";
      lines.push(`**${speakerLabel}:**`);
      lines.push(currentBlock.join(" "));
      lines.push("");
      currentBlock = [];
    }
  };

  for (const sentence of transcript.transcript) {
    const speakerId = sentence.speakerId ?? undefined;
    if (speakerId !== currentSpeaker) {
      flushBlock();
      currentSpeaker = speakerId;
    }
    currentBlock.push(sentence.text);
  }
  flushBlock();

  return lines.join("\n");
}

export function renderTranscripts(transcripts: GongCallTranscript[]): string {
  if (transcripts.length === 0) {
    return "No transcripts found.";
  }

  return transcripts.map(renderTranscript).join("\n\n---\n\n");
}
