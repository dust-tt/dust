import { Button, ChatBubbleBottomCenterPlusIcon } from "@dust-tt/sparkle";
import { useFrontContext } from "@extension/front/providers/FrontProvider";
import type { AttachButtonProps } from "@extension/shared/services/platform";
import type {
  ApplicationMessage,
  ApplicationMessageContent,
  ApplicationRecipient,
} from "@frontapp/plugin-sdk";

interface TimelineEntry {
  timestamp: Date;
  type: "inbound" | "outbound";
  sender: string;
  recipients: string[];
  subject?: string;
  content: string;
  attachments: string[];
}

function formatRecipient(recipient: ApplicationRecipient): string {
  // Format recipient to a string representation
  return recipient.handle || recipient.name || "Unknown";
}

function formatContent(content: ApplicationMessageContent | undefined): string {
  if (!content) {
    return "";
  }

  if (content.type === "html") {
    // Basic HTML to text conversion
    // You might want to use a proper HTML-to-text converter in production
    return content.body.replace(/<[^>]*>/g, "");
  }

  return content.body;
}

function createTimelineFromMessages(
  messages: readonly ApplicationMessage[]
): TimelineEntry[] {
  // Sort messages by date.
  const sortedMessages = [...messages].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );

  return sortedMessages.map((message) => {
    // Combine all recipients (to, cc, bcc) into a single array.
    const allRecipients = [
      ...(message.to || []),
      ...(message.cc || []),
      ...(message.bcc || []),
    ].map((recipient) => formatRecipient(recipient));

    // Create timeline entry.
    const entry: TimelineEntry = {
      timestamp: message.date,
      type: message.status,
      sender: formatRecipient(message.from),
      recipients: allRecipients,
      subject: message.subject,
      content: formatContent(message.content),
      attachments: message.content?.attachments.map((att) => att.name) || [],
    };

    return entry;
  });
}

// Convert timeline to LLM-friendly format.
function timelineToLLMFormat(timeline: TimelineEntry[]): string {
  return timeline
    .map((entry) => {
      const timestamp = entry.timestamp.toISOString();
      const direction = entry.type === "inbound" ? "RECEIVED" : "SENT";
      const attachmentInfo =
        entry.attachments.length > 0
          ? `\nAttachments: ${entry.attachments.join(", ")}`
          : "";

      return `[${timestamp}] ${direction}
  From: ${entry.sender}
  To: ${entry.recipients.join(", ")}
  ${entry.subject ? `Subject: ${entry.subject}\n` : ""}
  ${entry.content}${attachmentInfo}
  ---`;
    })
    .join("\n\n");
}

export const FrontAttachButtons = ({
  isBlinking,
  isLoading,
  fileUploaderService,
}: AttachButtonProps) => {
  const frontContext = useFrontContext();

  if (!frontContext) {
    return null;
  }

  if (frontContext.type !== "singleConversation") {
    return null; // Only show attach buttons in single conversation.
  }

  return (
    <div>
      <Button
        icon={ChatBubbleBottomCenterPlusIcon}
        label="Include conversation"
        tooltip="Add conversation content"
        variant="outline"
        className={isBlinking ? "animate-[bgblink_200ms_3]" : ""}
        size="sm"
        onClick={async () => {
          const messages = await frontContext.listMessages();
          const timeline = createTimelineFromMessages(messages.results);
          const llmFormat = timelineToLLMFormat(timeline);

          const file = new File([llmFormat], "conversation.txt", {
            type: "text/plain",
          });

          console.log(llmFormat);

          const files = [file];

          await fileUploaderService.handleFilesUpload({
            files,
            kind: "tab_content",
          });
        }}
        disabled={isLoading}
      />
    </div>
  );
};
