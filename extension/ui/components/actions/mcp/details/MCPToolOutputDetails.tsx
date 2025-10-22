import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type {
  ReasoningSuccessOutputType,
  ThinkingOutputType,
} from "@dust-tt/client";
import {
  isIncludeQueryResourceType,
  isSearchQueryResourceType,
  isWebsearchQueryResourceType,
} from "@dust-tt/client";
import {
  ContentMessage,
  InformationCircleIcon,
  Markdown,
} from "@dust-tt/sparkle";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface ThinkingBlockProps {
  resource: ThinkingOutputType;
}

export function ThinkingBlock({ resource }: ThinkingBlockProps) {
  return (
    resource.text && (
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <ContentMessage
          title="Reasoning"
          variant="primary"
          icon={InformationCircleIcon}
          size="lg"
        >
          <Markdown
            content={resource.text}
            isStreaming={false}
            forcedTextSize="text-sm"
            textColor="text-muted-foreground"
            isLastMessage={false}
          />
        </ContentMessage>
      </div>
    )
  );
}

interface ReasoningSuccessBlockProps {
  resource: ReasoningSuccessOutputType;
}

export function ReasoningSuccessBlock({
  resource,
}: ReasoningSuccessBlockProps) {
  return (
    resource.text && (
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        <Markdown
          content={resource.text}
          textColor="text-muted-foreground dark:text-muted-foreground-night"
          isStreaming={false}
          forcedTextSize="md"
          isLastMessage={false}
        />
      </div>
    )
  );
}

interface SearchResultProps {
  actionName: string;
  query?: string;
  visual: React.ComponentType<{ className?: string }>;
  actionOutput: CallToolResult["content"] | null;
  viewType: "conversation" | "sidebar";
}

export function SearchResultDetails({
  actionName,
  query,
  visual,
  viewType,
  actionOutput,
}: SearchResultProps) {
  const displayQuery = query || "No query provided";

  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={visual}
    >
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        {displayQuery}
      </div>
    </ActionDetailsWrapper>
  );
}
