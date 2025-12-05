import { ActionDetailsWrapper } from "@app/ui/components/actions/ActionDetailsWrapper";
import type {
  ReasoningSuccessOutputType,
  ThinkingOutputType,
} from "@dust-tt/client";
import {
  ContentMessage,
  InformationCircleIcon,
  Markdown,
} from "@dust-tt/sparkle";

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
  query: string | null;
  visual: React.ComponentType<{ className?: string }>;
  viewType: "conversation" | "sidebar";
}

export function SearchResultDetails({
  actionName,
  query,
  visual,
  viewType,
}: SearchResultProps) {
  return (
    <ActionDetailsWrapper
      viewType={viewType}
      actionName={actionName}
      visual={visual}
    >
      <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
        {query ?? "No query provided"}
      </div>
    </ActionDetailsWrapper>
  );
}
