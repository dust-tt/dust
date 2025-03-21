import type {
  CaptureOperationId,
  CaptureOptions,
  CaptureService,
  TabContent,
} from "@app/shared/services/capture";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import type {
  ApplicationComment,
  ApplicationCommentContent,
  ApplicationMessage,
  ApplicationMessageContent,
  ApplicationRecipient,
  ApplicationTeammate,
} from "@frontapp/plugin-sdk";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";

interface TimelineEntry {
  timestamp: Date;
  type: "COMMENT" | "RECEIVED" | "SENT";
  sender: string;
  recipients: string[];
  subject?: string;
  content: string;
  attachments: string[];
}

function formatRecipient(
  recipient: ApplicationRecipient | ApplicationTeammate
): string {
  if ("handle" in recipient) {
    return recipient.handle;
  }

  // Format recipient to a string representation.
  return recipient.name || "Unknown";
}

function formatContent(
  content: ApplicationMessageContent | ApplicationCommentContent | undefined
): string {
  if (!content) {
    return "";
  }

  if ("type" in content && content.type === "html") {
    return content.body.replace(/<[^>]*>/g, "").trim();
  }

  return content.body.trim();
}

function createTimelineFromMessagesAndComments(
  messages: readonly ApplicationMessage[],
  comments: readonly ApplicationComment[]
): TimelineEntry[] {
  const timeline = [
    ...messages.map((message) => ({
      item: message,
      type: "message" as const,
    })),
    ...comments.map((comment) => ({
      item: {
        ...comment,
        date: comment.createdAt,
      },
      type: "comment" as const,
    })),
  ].sort((a, b) => a.item.date.getTime() - b.item.date.getTime());

  return timeline.map(({ item, type }) => {
    if (type === "message") {
      // Combine all recipients (to, cc, bcc) into a single array.
      const allRecipients = [
        ...(item.to || []),
        ...(item.cc || []),
        ...(item.bcc || []),
      ].map((recipient) => formatRecipient(recipient));

      // Create timeline entry for message
      return {
        timestamp: item.date,
        type: item.status === "inbound" ? "RECEIVED" : "SENT",
        sender: formatRecipient(item.from),
        recipients: allRecipients,
        subject: item.subject,
        content: formatContent(item.content),
        attachments: item.content?.attachments.map((att) => att.name) || [],
      };
    } else {
      // Create timeline entry for comment
      return {
        timestamp: item.date,
        type: "COMMENT",
        sender: formatRecipient(item.author),
        recipients: [], // Comments don't have recipients
        content: formatContent(item.content),
        attachments: item.content?.attachments.map((att) => att.name) || [],
      };
    }
  });
}

// Convert timeline to LLM-friendly format.
function timelineToLLMFormat(timeline: TimelineEntry[]): string {
  const metadata = `<conversation>
  TOTAL_MESSAGES: ${timeline.length}
  CONVERSATION_START: ${timeline[0].timestamp.toISOString()}
  CONVERSATION_END: ${timeline[timeline.length - 1].timestamp.toISOString()}
  PARTICIPANTS: ${[...new Set(timeline.flatMap((e) => [e.sender, ...e.recipients]))].join(", ")}
  </conversation>\n\n`;

  const entries = timeline
    .map((entry, index) => {
      const timestamp = entry.timestamp.toISOString();
      const attachmentInfo =
        entry.attachments.length > 0
          ? `ATTACHMENTS:\n${entry.attachments.map((a) => `- ${a}`).join("\n")}`
          : "";

      return `<entry index="${index + 1}" type="${entry.type}">
  FROM: ${entry.sender}
  TO: ${entry.recipients.join(", ")}
  TIMESTAMP: ${timestamp}
  ${entry.subject ? `SUBJECT: ${entry.subject}\n` : ""}
  CONTENT:
  ${entry.content}
  ${attachmentInfo}
  </entry>`;
    })
    .join("\n\n");

  return metadata + entries;
}

export class FrontCaptureService implements CaptureService {
  constructor(private frontContext: WebViewContext) {}

  isOperationSupported(id: CaptureOperationId) {
    return ["capture-page-content"].includes(id);
  }

  private async capturePageContent(): Promise<Result<TabContent, Error>> {
    if (this.frontContext.type !== "singleConversation") {
      return new Err(new Error("Not in a single conversation"));
    }

    const messages = await this.frontContext.listMessages();
    const comments = await this.frontContext.listComments();
    const timeline = createTimelineFromMessagesAndComments(
      messages.results,
      comments.results
    );
    const llmFormat = timelineToLLMFormat(timeline);

    return new Ok({
      content: llmFormat,
      title: this.frontContext.conversation.id,
      // TODO: This should be the URL of the conversation.
      //   url: "",
    });
  }

  async handleOperation(
    id: CaptureOperationId,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options: CaptureOptions
  ): Promise<Result<TabContent, Error>> {
    switch (id) {
      case "capture-page-content":
        return this.capturePageContent();

      default:
        throw new Error(`Operation ${id} not supported`);
    }
  }
}
