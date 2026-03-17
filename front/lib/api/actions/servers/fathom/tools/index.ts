import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { FathomMCPClient } from "@app/lib/api/actions/servers/fathom/client";
import { FATHOM_TOOLS_METADATA } from "@app/lib/api/actions/servers/fathom/metadata";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { Err, Ok } from "@app/types/shared/result";
import type {
  ActionItem,
  CRMMatches,
  Meeting,
  MeetingSummary,
  TranscriptItem,
} from "fathom-typescript/sdk/models/shared";

type EnrichedMeeting = Meeting & {
  fetchedSummary?: MeetingSummary | null;
};

function formatMeeting(meeting: EnrichedMeeting): string {
  const lines = [
    `--${meeting.title}--`,
    `Recording ID: ${meeting.recordingId}`,
    `Date: ${meeting.recordingStartTime.toISOString().split("T")[0]}`,
    `Time: ${meeting.recordingStartTime.toISOString()} → ${meeting.recordingEndTime.toISOString()}`,
    `Recorded by: ${meeting.recordedBy.name} (${meeting.recordedBy.email})`,
    `URL: ${meeting.url}`,
  ];

  if (meeting.calendarInvitees.length > 0) {
    const attendees = meeting.calendarInvitees
      .map((inv) => `${inv.name ?? "Unknown"} <${inv.email ?? ""}>`.trim())
      .join(", ");
    lines.push(`Attendees: ${attendees}`);
  }

  if (meeting.actionItems && meeting.actionItems.length > 0) {
    lines.push(`\nAction Items (${meeting.actionItems.length}):`);
    lines.push(formatActionItems(meeting.actionItems));
  }

  const summary = meeting.fetchedSummary ?? meeting.defaultSummary;
  if (summary) {
    lines.push(`\nSummary:`);
    lines.push(formatSummary(summary));
  }
  lines.push(
    `\n*Use get_transcript with recording_id=${meeting.recordingId} to fetch the transcript.*`
  );

  if (meeting.crmMatches) {
    const crmText = formatCrmMatches(meeting.crmMatches);
    if (crmText) {
      lines.push(`\nCRM Matches:`);
      lines.push(crmText);
    }
  }

  return lines.join("\n");
}

function formatActionItems(actionItems: ActionItem[]): string {
  return actionItems
    .map((item, i) => {
      const assignee =
        item.assignee.name ?? item.assignee.email ?? "Unassigned";
      const status = item.completed ? "Completed" : "Not Completed";
      return `${i + 1}. ${status} ${item.description}\n   Assignee: ${assignee} | Timestamp: ${item.recordingTimestamp}`;
    })
    .join("\n");
}

function formatSummary(summary: MeetingSummary): string {
  const parts: string[] = [];
  if (summary.templateName) {
    parts.push(`Template: ${summary.templateName}`);
  }
  if (summary.markdownFormatted) {
    parts.push(summary.markdownFormatted);
  }
  return parts.join("\n") || "No summary content.";
}

function formatTranscript(transcript: TranscriptItem[]): string {
  return transcript
    .map(
      (item) => `[${item.timestamp}] ${item.speaker.displayName}: ${item.text}`
    )
    .join("\n");
}

function formatCrmMatches(crm: CRMMatches): string {
  const parts: string[] = [];
  if (crm.contacts && crm.contacts.length > 0) {
    parts.push(
      `Contacts: ${crm.contacts.map((c) => `${c.name} (${c.email})`).join(", ")}`
    );
  }
  if (crm.companies && crm.companies.length > 0) {
    parts.push(`Companies: ${crm.companies.map((c) => c.name).join(", ")}`);
  }
  if (crm.deals && crm.deals.length > 0) {
    parts.push(
      `Deals: ${crm.deals.map((d) => `${d.name} ($${d.amount})`).join(", ")}`
    );
  }
  return parts.join("\n");
}

const handlers: ToolHandlers<typeof FATHOM_TOOLS_METADATA> = {
  list_meetings: async (
    {
      cursor,
      start_date,
      end_date,
      recording_id,
      calendar_invitees_domains,
      calendar_invitees_domains_type,
      recorded_by,
      teams,
      include_action_items,
      include_crm_matches,
      include_summary,
    },
    { authInfo }
  ) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("No access token provided"));
    }

    const client = new FathomMCPClient(token);
    const result = await client.listMeetings({
      cursor,
      startDate: start_date,
      endDate: end_date,
      recordingId: recording_id,
      calendarInviteesDomains: calendar_invitees_domains,
      calendarInviteesDomainsType: calendar_invitees_domains_type,
      recordedBy: recorded_by,
      teams,
      includeActionItems: include_action_items,
      includeCrmMatches: include_crm_matches,
    });

    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const { meetings, nextCursor } = result.value;

    if (meetings.length === 0) {
      return new Ok([
        {
          type: "text" as const,
          text:
            recording_id !== undefined
              ? `Meeting with recording ID ${recording_id} not found on this page.${nextCursor ? ` Use cursor="${nextCursor}" to check the next page.` : ""}`
              : "No meetings found for the given filters.",
        },
      ]);
    }

    // Enrich with summary from the recordings API if requested.
    const enriched: EnrichedMeeting[] = await concurrentExecutor(
      meetings,
      async (meeting) => {
        const enrichedMeeting: EnrichedMeeting = { ...meeting };

        if (include_summary) {
          const summaryResult = await client.getSummary(meeting.recordingId);
          if (summaryResult.isOk()) {
            enrichedMeeting.fetchedSummary = summaryResult.value;
          }
        }

        return enrichedMeeting;
      },
      { concurrency: 8 }
    );

    const paginationNote = nextCursor
      ? `\n\nMore results available. Use cursor="${nextCursor}" to fetch the next page.`
      : "";

    return new Ok([
      {
        type: "text" as const,
        text: `Found ${enriched.length} meeting(s):\n\n${enriched.map(formatMeeting).join("\n\n---\n\n")}${paginationNote}`,
      },
    ]);
  },

  get_transcript: async ({ recording_id }, { authInfo }) => {
    const token = authInfo?.token;
    if (!token) {
      return new Err(new MCPError("No access token provided"));
    }

    const client = new FathomMCPClient(token);
    const result = await client.getTranscript(recording_id);

    if (result.isErr()) {
      return new Err(new MCPError(result.error.message));
    }

    const fullText = formatTranscript(result.value);
    return new Ok([{ type: "text" as const, text: fullText }]);
  },
};

export const TOOLS = buildTools(FATHOM_TOOLS_METADATA, handlers);
