import { useCompactConversation } from "@app/hooks/conversations";
import type { GetConversationContextUsageResponse } from "@app/lib/api/assistant/conversation/context_usage";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessageInline, Hoverable, InfoCircle } from "@dust-tt/sparkle";

interface ContextUsageWarningBannerProps {
  owner: LightWorkspaceType;
  conversationId: string;
  contextUsage: GetConversationContextUsageResponse;
}

export const ContextUsageWarningBanner = ({
  owner,
  conversationId,
  contextUsage,
}: ContextUsageWarningBannerProps) => {
  const { compact, isCompacting } = useCompactConversation({
    owner,
    conversationId,
  });

  return (
    <ContentMessageInline
      icon={InfoCircle}
      variant="info"
      className="mb-2 flex w-full"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <span className="min-w-0 truncate">
          Conversation context is almost full
        </span>
        {isCompacting ? (
          <span className="copy-sm shrink-0 text-muted-foreground dark:text-muted-foreground-night">
            Compacting
          </span>
        ) : (
          <Hoverable
            variant="primary"
            className="copy-sm shrink-0 underline underline-offset-2"
            onClick={() => {
              if (contextUsage.model) {
                void compact(contextUsage.model);
              }
            }}
          >
            Compact now
          </Hoverable>
        )}
      </div>
    </ContentMessageInline>
  );
};
