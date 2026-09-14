import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  Code01,
  cn,
  File02,
  NavTabPillList,
  NavTabPillTrigger,
  Spinner,
} from "@dust-tt/sparkle";

interface ConversationMessagesHeaderProps {
  pendingUserCount: number;
  createdAgentCount: number;
}

export function ConversationMessagesHeader({
  pendingUserCount,
  createdAgentCount,
}: ConversationMessagesHeaderProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-separator pb-4">
      <h4 className="text-base font-semibold">Messages</h4>
      {(pendingUserCount > 0 || createdAgentCount > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="sr-only">Active messages</span>
          {pendingUserCount > 0 && (
            <span
              className={cn(
                "inline-flex h-7 items-center gap-2 whitespace-nowrap",
                "rounded-md border border-separator bg-background",
                "px-2 text-sm text-foreground"
              )}
            >
              <span className="tabular-nums">{pendingUserCount}</span>
              user message
              {pluralize(pendingUserCount)} queued
            </span>
          )}
          {createdAgentCount > 0 && (
            <span
              className={cn(
                "inline-flex h-7 items-center gap-2 whitespace-nowrap",
                "rounded-md border border-separator bg-background",
                "px-2 text-sm text-foreground"
              )}
            >
              <Spinner size="xs" />
              <span className="tabular-nums">{createdAgentCount}</span>
              agent message
              {pluralize(createdAgentCount)} generating
            </span>
          )}
        </div>
      )}
      <div className="ml-auto shrink-0 rounded-2xl border border-border-dark bg-background p-1">
        <NavTabPillList>
          <NavTabPillTrigger value="raw" icon={Code01}>
            Raw text
          </NavTabPillTrigger>
          <NavTabPillTrigger value="markdown" icon={File02}>
            Markdown
          </NavTabPillTrigger>
        </NavTabPillList>
      </div>
    </div>
  );
}
