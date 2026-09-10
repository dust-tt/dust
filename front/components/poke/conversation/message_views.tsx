import type { ChipColor } from "@app/components/poke/conversation/message_metadata";
import { StatusBadge } from "@app/components/poke/conversation/message_metadata";
import type {
  CompactionMessageStatus,
  CompactionMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isFileContentFragment } from "@app/types/content_fragment";
import {
  ChevronDown,
  ConversationMessage,
  cn,
  Markdown,
  XClose,
} from "@dust-tt/sparkle";
import { useState } from "react";

const USER_VISIBILITY: Record<string, { label: string; color: ChipColor }> = {
  visible: { label: "sent", color: "success" },
  pending: { label: "queued", color: "warning" },
  deleted: { label: "deleted", color: "warning" },
};

const COMPACTION_STATUS: Record<
  CompactionMessageStatus,
  { label: string; color: ChipColor }
> = {
  created: { label: "generating", color: "warning" },
  succeeded: { label: "succeeded", color: "success" },
  failed: { label: "failed", color: "warning" },
};

interface UserMessageViewProps {
  message: UserMessageType;
  useMarkdown: boolean;
}

export const UserMessageView = ({
  message,
  useMarkdown,
}: UserMessageViewProps) => {
  const hasDustSystemTag = message.content.includes("<dust_system>");
  const [isExpanded, setIsExpanded] = useState(!hasDustSystemTag);

  return (
    <div className="flex grow flex-col">
      <div className="max-w-full self-end">
        <ConversationMessage
          pictureUrl={message.user?.image}
          name={message.user?.fullName ?? message.user?.username}
          type="user"
        >
          {hasDustSystemTag && !isExpanded ? (
            <button
              type="button"
              onClick={() => setIsExpanded(true)}
              className={cn(
                "flex cursor-pointer items-center gap-1",
                "text-sm italic text-muted-foreground hover:text-foreground"
              )}
            >
              <ChevronDown className="h-4 w-4" />
              <span>Hidden System Message (click to expand)</span>
            </button>
          ) : (
            <>
              {hasDustSystemTag && (
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className={cn(
                    "mb-2 flex cursor-pointer items-center gap-1",
                    "text-sm italic text-muted-foreground hover:text-foreground"
                  )}
                >
                  <XClose className="h-4 w-4" />
                  <span>Hide System Message</span>
                </button>
              )}
              {useMarkdown ? (
                <Markdown content={message.content} />
              ) : (
                <div className="whitespace-pre-wrap">{message.content}</div>
              )}
            </>
          )}
          <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
            <StatusBadge
              label={
                USER_VISIBILITY[message.visibility]?.label ?? message.visibility
              }
              color={USER_VISIBILITY[message.visibility]?.color ?? "primary"}
            />
            <span>{new Date(message.created).toLocaleString()}</span>
            {message.context.origin === "wakeup" && (
              <StatusBadge label="wake-up" color="highlight" />
            )}
          </div>
        </ConversationMessage>
      </div>
    </div>
  );
};

interface ContentFragmentViewProps {
  message: ContentFragmentType;
}

export const ContentFragmentView = ({ message }: ContentFragmentViewProps) => {
  return (
    <div className="w-full text-sm">
      <div className="font-bold">[content_fragment] {message.title}</div>
      <div className="text-sm text-muted-foreground">
        date : {new Date(message.created).toLocaleString()} {" • "}
        version :{message.version} {" • "}
        textBytes :{isFileContentFragment(message) ? message.textBytes : "N/A"}
      </div>
      <div className="text-sm text-muted-foreground">
        textBytes={isFileContentFragment(message) ? message.textBytes : "N/A"}
      </div>
      {message.sourceUrl && (
        <a
          href={message.sourceUrl ?? ""}
          target="_blank"
          className="text-highlight"
        >
          [sourceUrl]
        </a>
      )}{" "}
      <a
        href={isFileContentFragment(message) ? (message.textUrl ?? "") : ""}
        target="_blank"
        className="text-highlight"
      >
        [textUrl]
      </a>
    </div>
  );
};

interface CompactionMessageViewProps {
  message: CompactionMessageType;
}

export const CompactionMessageView = ({
  message,
}: CompactionMessageViewProps) => {
  return (
    <div className="w-full text-sm">
      <div className="font-bold">[compaction]</div>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <StatusBadge
          label={COMPACTION_STATUS[message.status]?.label ?? message.status}
          color={COMPACTION_STATUS[message.status]?.color ?? "primary"}
        />
        date : {new Date(message.created).toLocaleString()} {" • "}
        version :{message.version}
      </div>
      {message.content && <Markdown content={message.content || ""} />}
    </div>
  );
};
