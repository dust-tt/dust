import {
  Avatar,
  Button,
  Card,
  CardActionButton,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ExternalLinkIcon,
  EyeIcon,
  EyeSlashIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Hoverable,
  Icon,
  NavigationListLabel,
  Spinner,
} from "@dust-tt/sparkle";
import { memo, useCallback, useEffect, useState } from "react";
import { useInView } from "react-intersection-observer";

import { TabContentChildSectionLayout } from "@app/components/agent_builder/observability/TabContentChildSectionLayout";
import { useDismissFeedback } from "@app/hooks/useDismissFeedback";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import {
  useAgentConfigurationFeedbacksByDescVersion,
  useAgentConfigurationHistory,
} from "@app/lib/swr/assistants";
import { formatTimestampToFriendlyDate, timeAgoFrom } from "@app/lib/utils";
import { getConversationRoute } from "@app/lib/utils/router";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@app/types";

const FEEDBACKS_PAGE_SIZE = 50;

type FeedbackFilter = "unseen" | "all";

interface FeedbacksSectionProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
}

export const FeedbacksSection = ({
  owner,
  agentConfigurationId,
}: FeedbacksSectionProps) => {
  const [feedbackFilter, setFeedbackFilter] =
    useState<FeedbackFilter>("unseen");

  const {
    isAgentConfigurationFeedbacksLoading,
    isValidating,
    agentConfigurationFeedbacks,
    hasMore,
    setSize,
    size,
    mutateAgentConfigurationFeedbacks,
  } = useAgentConfigurationFeedbacksByDescVersion({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationId,
    limit: FEEDBACKS_PAGE_SIZE,
    filter: feedbackFilter,
  });

  // Intersection observer to detect when the user has scrolled to the bottom of the list.
  const { ref: bottomRef, inView: isBottomOfListVisible } = useInView();
  useEffect(() => {
    if (
      isBottomOfListVisible &&
      hasMore &&
      !isValidating &&
      !isAgentConfigurationFeedbacksLoading
    ) {
      void setSize(size + 1);
    }
  }, [
    isBottomOfListVisible,
    hasMore,
    isValidating,
    isAgentConfigurationFeedbacksLoading,
    setSize,
    size,
  ]);

  const { agentConfigurationHistory, isAgentConfigurationHistoryLoading } =
    useAgentConfigurationHistory({
      workspaceId: owner.sId,
      agentConfigurationId: agentConfigurationId,
      disabled: !agentConfigurationId,
    });

  if (
    isAgentConfigurationFeedbacksLoading ||
    isAgentConfigurationHistoryLoading
  ) {
    return (
      <div className="w-full p-6">
        <Spinner variant="dark" />
      </div>
    );
  }

  if (!agentConfigurationHistory) {
    return (
      <div className="mt-3 text-sm text-foreground dark:text-foreground-night">
        Error loading the previous agent versions.
      </div>
    );
  }

  // Group feedbacks by agent configuration version
  const feedbacksByVersion =
    agentConfigurationFeedbacks?.reduce(
      (acc, feedback) => {
        const version = feedback.agentConfigurationVersion;
        if (!acc[version]) {
          acc[version] = [];
        }
        acc[version].push(feedback);
        return acc;
      },
      {} as Record<number, typeof agentConfigurationFeedbacks>
    ) || {};

  // Get versions in order (preserving the original feedback order)
  const versionsInOrder = Array.from(
    new Set(
      agentConfigurationFeedbacks?.map((f) => f.agentConfigurationVersion) || []
    )
  );

  // Create a lookup map for agent configurations by version (O(1) lookup)
  const agentConfigByVersion =
    agentConfigurationHistory?.reduce(
      (acc, config) => {
        acc[config.version] = config;
        return acc;
      },
      {} as Record<number, LightAgentConfigurationType>
    ) || {};

  const latestVersion = agentConfigurationHistory[0].version;

  return (
    <TabContentChildSectionLayout
      title="Feedback"
      headerAction={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              label={feedbackFilter === "unseen" ? "Unseen" : "All"}
              isSelect
              variant="outline"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => setFeedbackFilter("unseen")}
              label="Unseen"
            />
            <DropdownMenuItem
              onClick={() => setFeedbackFilter("all")}
              label="All"
            />
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {!agentConfigurationFeedbacks ||
      agentConfigurationFeedbacks.length === 0 ? (
        <div className="mt-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
          No feedback yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {versionsInOrder.map((version) => {
            const versionFeedbacks = feedbacksByVersion[version];
            const agentConfig = agentConfigByVersion[version];
            const isLatestVersion = version === latestVersion;

            return (
              <div key={version} className="flex flex-col gap-4">
                <AgentConfigurationVersionHeader
                  agentConfiguration={agentConfig}
                  agentConfigurationVersion={version}
                  isLatestVersion={isLatestVersion}
                />
                <div className="@container">
                  <div className="grid grid-cols-1 gap-4 @md:grid-cols-2">
                    {versionFeedbacks?.map((feedback) => (
                      <MemoizedFeedbackCard
                        key={feedback.sId}
                        className="h-full"
                        owner={owner}
                        feedback={
                          feedback as AgentMessageFeedbackWithMetadataType
                        }
                        onDismiss={() =>
                          void mutateAgentConfigurationFeedbacks()
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {/* Invisible div to act as a scroll anchor for detecting when the user has scrolled to the bottom */}
      <div ref={bottomRef} className="h-1.5" />
    </TabContentChildSectionLayout>
  );
};

interface AgentConfigurationVersionHeaderProps {
  agentConfigurationVersion: number;
  agentConfiguration: LightAgentConfigurationType | undefined;
  isLatestVersion: boolean;
}

function AgentConfigurationVersionHeader({
  agentConfigurationVersion,
  agentConfiguration,
  isLatestVersion,
}: AgentConfigurationVersionHeaderProps) {
  const getAgentConfigurationVersionString = useCallback(
    (config: LightAgentConfigurationType) => {
      if (isLatestVersion) {
        return "Latest version";
      }
      if (!config.versionCreatedAt) {
        return `v${config.version}`;
      }
      const versionDate = new Date(config.versionCreatedAt);
      return (
        "Version: " +
        formatTimestampToFriendlyDate(versionDate.getTime(), "long")
      );
    },
    [isLatestVersion]
  );

  return (
    <NavigationListLabel
      label={
        agentConfiguration
          ? getAgentConfigurationVersionString(agentConfiguration)
          : `v${agentConfigurationVersion}`
      }
    />
  );
}

interface FeedbackCardProps {
  owner: LightWorkspaceType;
  feedback: AgentMessageFeedbackWithMetadataType;
  className?: string;
  onDismiss?: () => void;
}

const MemoizedFeedbackCard = memo(FeedbackCard);

function FeedbackCard({
  owner,
  feedback,
  className,
  onDismiss,
}: FeedbackCardProps) {
  const { isDismissing, toggleDismiss } = useDismissFeedback({
    workspaceId: owner.sId,
    agentConfigurationId: feedback.agentConfigurationId,
    feedbackId: feedback.sId,
    onSuccess: onDismiss,
  });

  const conversationUrl =
    feedback.conversationId &&
    feedback.messageId &&
    // IMPORTANT: We need to check if the conversation is shared before displaying it.
    // This check is redundant: the conversationId is null if the conversation is not shared.
    feedback.isConversationShared
      ? getConversationRoute(
          owner.sId,
          feedback.conversationId,
          `messageId=${feedback.messageId}`,
          process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL
        )
      : null;

  const timeSinceFeedback = timeAgoFrom(
    new Date(feedback.createdAt).getTime(),
    {
      useLongFormat: true,
    }
  );

  return (
    <Card
      className={cn("flex h-full flex-col", className)}
      action={
        <div className="flex gap-1">
          <CardActionButton
            size="mini"
            icon={feedback.dismissed ? EyeIcon : EyeSlashIcon}
            onClick={() => toggleDismiss(!feedback.dismissed)}
            disabled={isDismissing}
            tooltip={`Mark feedback as ${feedback.dismissed ? "seen" : "unseen"}`}
          />
          {conversationUrl && (
            <CardActionButton
              size="mini"
              icon={ExternalLinkIcon}
              href={conversationUrl ?? ""}
              disabled={!conversationUrl}
              tooltip="View conversation"
              target="_blank"
            />
          )}
        </div>
      }
    >
      <div className="flex flex-shrink-0 items-center gap-3 px-4 py-3">
        <Avatar
          size="sm"
          visual={feedback.userImageUrl}
          name={feedback.userName}
        />
        <div className="flex flex-col">
          <div className="font-semibold">{feedback.userName}</div>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            {timeSinceFeedback} ago
          </div>
        </div>
      </div>

      <div className="flex flex-grow flex-col gap-3 overflow-hidden px-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex-shrink-0 rounded-full p-2",
              feedback.thumbDirection === "up"
                ? "bg-success-200 dark:bg-success-200-night"
                : "bg-info-200 dark:bg-info-200-night"
            )}
          >
            <Icon
              size="xs"
              className={cn(
                "text-foreground dark:text-foreground-night",
                feedback.thumbDirection === "up"
                  ? "text-success-800 dark:text-success-800-night"
                  : "text-info-800 dark:text-info-800-night"
              )}
              visual={
                feedback.thumbDirection === "up"
                  ? HandThumbUpIcon
                  : HandThumbDownIcon
              }
            />
          </div>
          <div className="flex-grow overflow-hidden">{feedback.content}</div>
        </div>
      </div>

      {conversationUrl && (
        <div className="flex-shrink-0 px-4 py-3">
          <Hoverable variant="primary" href={conversationUrl} target="_blank">
            View conversation
          </Hoverable>
        </div>
      )}
    </Card>
  );
}
