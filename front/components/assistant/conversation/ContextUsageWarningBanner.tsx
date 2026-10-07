import { useCompactConversation } from "@app/hooks/conversations";
import type { GetConversationContextUsageResponse } from "@app/lib/api/assistant/conversation/context_usage";
import type { LightWorkspaceType } from "@app/types/user";
import { ContentMessageInline, Hoverable, InfoCircle } from "@dust-tt/sparkle";
import { Trans } from "@lingui/react/macro";

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
          <Trans>Conversation context is almost full</Trans>
        </span>
        {isCompacting ? (
          <span className="copy-sm shrink-0 text-muted-foreground">
            <Trans>Compacting</Trans>
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
            <Trans>Compact now</Trans>
          </Hoverable>
        )}
      </div>
    </ContentMessageInline>
  );
};
