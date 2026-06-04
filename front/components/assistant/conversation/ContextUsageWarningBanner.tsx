import { useCompactConversation } from "@app/hooks/conversations";
import type { GetConversationContextUsageResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/context-usage";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ContentMessageAction,
  ContentMessageInline,
  InfoCircleV2,
} from "@dust-tt/sparkle";

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
      icon={InfoCircleV2}
      variant="info"
      className="mb-5 flex max-h-dvh w-full"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate text-foreground dark:text-foreground-night">
          Conversation context is almost full.
        </span>
      </div>
      <ContentMessageAction
        label={isCompacting ? "Compacting" : "Compact now"}
        variant="outline"
        size="xs"
        disabled={isCompacting}
        onClick={() => {
          if (contextUsage.model) {
            void compact(contextUsage.model);
          }
        }}
      />
    </ContentMessageInline>
  );
};
