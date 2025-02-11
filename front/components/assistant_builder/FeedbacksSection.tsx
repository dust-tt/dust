import {
  Avatar,
  Card,
  CardActionButton,
  cn,
  ExternalLinkIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Hoverable,
  Icon,
  NavigationListLabel,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { memo, useCallback, useEffect } from "react";
import { useInView } from "react-intersection-observer";

import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import {
  useAgentConfigurationFeedbacksByDescVersion,
  useAgentConfigurationHistory,
} from "@app/lib/swr/assistants";
import { formatTimestampToFriendlyDate, timeAgoFrom } from "@app/lib/utils";

const FEEDBACKS_PAGE_SIZE = 50;

interface FeedbacksSectionProps {
  owner: LightWorkspaceType;
  agentConfigurationId: string;
}
export const FeedbacksSection = ({
  owner,
  agentConfigurationId,
}: FeedbacksSectionProps) => {
  const {
    isAgentConfigurationFeedbacksLoading,
    isValidating,
    agentConfigurationFeedbacks,
    hasMore,
    setSize,
    size,
  } = useAgentConfigurationFeedbacksByDescVersion({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationId,
    limit: FEEDBACKS_PAGE_SIZE,
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

  if (
    !isAgentConfigurationFeedbacksLoading &&
    (!agentConfigurationFeedbacks || agentConfigurationFeedbacks.length === 0)
  ) {
    return (
      <div className="mt-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
        No feedback yet.
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

  return (
    <>
      <div className="flex flex-col gap-2">
        <AgentConfigurationVersionHeader
          agentConfiguration={agentConfigurationHistory[0]}
          agentConfigurationVersion={agentConfigurationHistory[0].version}
          isLatestVersion
        />
        {agentConfigurationFeedbacks?.map((feedback, index) => {
          const isFirstFeedback = index === 0;
          const previousFeedbackHasDifferentVersion =
            !isFirstFeedback &&
            feedback.agentConfigurationVersion !==
              agentConfigurationFeedbacks[index - 1].agentConfigurationVersion;
          return (
            <div key={feedback.id} className="animate-fadeIn">
              {previousFeedbackHasDifferentVersion && (
                <AgentConfigurationVersionHeader
                  agentConfiguration={agentConfigurationHistory?.find(
                    (c) => c.version === feedback.agentConfigurationVersion
                  )}
                  agentConfigurationVersion={feedback.agentConfigurationVersion}
                  isLatestVersion={false}
                />
              )}
              <MemoizedFeedbackCard
                owner={owner}
                feedback={feedback as AgentMessageFeedbackWithMetadataType}
              />
            </div>
          );
        })}
      </div>
      {/* Invisible div to act as a scroll anchor for detecting when the user has scrolled to the bottom */}
      <div ref={bottomRef} className="h-1.5" />
    </>
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
}
const MemoizedFeedbackCard = memo(FeedbackCard);
function FeedbackCard({ owner, feedback }: FeedbackCardProps) {
  const conversationUrl =
    feedback.conversationId &&
    feedback.messageId &&
    // IMPORTANT: We need to check if the conversation is shared before displaying it.
    // This check is redundant: the conversationId is null if the conversation is not shared.
    feedback.isConversationShared
      ? `${process.env.NEXT_PUBLIC_DUST_CLIENT_FACING_URL}/w/${owner.sId}/assistant/${feedback.conversationId}?messageId=${feedback.messageId}`
      : null;

  const timeSinceFeedback = timeAgoFrom(
    new Date(feedback.createdAt).getTime(),
    {
      useLongFormat: true,
    }
  );

  return (
    <Card
      action={
        conversationUrl && (
          <CardActionButton
            size="mini"
            icon={ExternalLinkIcon}
            href={conversationUrl ?? ""}
            disabled={!conversationUrl}
            tooltip="View conversation"
            target="_blank"
          />
        )
      }
    >
      <div className="flex w-full flex-col gap-3 text-sm font-normal text-foreground dark:text-foreground-night">
        <div className="flex w-full flex-row gap-3">
          {feedback.userImageUrl ? (
            <Avatar
              size="sm"
              visual={feedback.userImageUrl}
              name={feedback.userName}
            />
          ) : (
            <Spinner size="sm" />
          )}
          <div className="flex flex-col">
            <div className="font-semibold">{feedback.userName}</div>
            <div className="text-muted-foreground dark:text-muted-foreground-night">
              {timeSinceFeedback} ago
            </div>
          </div>
        </div>
        <div className="flex w-full flex-row gap-3 text-base">
          <div>
            <div
              className={cn(
                "rounded-full bg-primary-300 p-2",
                feedback.thumbDirection === "up"
                  ? "bg-success-200"
                  : "bg-amber-200"
              )}
            >
              <Icon
                size="xs"
                className={cn(
                  "text-foreground dark:text-foreground-night",
                  feedback.thumbDirection === "up"
                    ? "text-success-800 dark:text-success-800-night"
                    : "text-amber-800 dark:text-amber-800-night"
                )}
                visual={
                  feedback.thumbDirection === "up"
                    ? HandThumbUpIcon
                    : HandThumbDownIcon
                }
              />
            </div>
          </div>
          <div className="flex flex-col">
            {feedback.content}
            {conversationUrl && (
              <div>
                <Hoverable
                  variant="primary"
                  href={conversationUrl ?? ""}
                  target="_blank"
                >
                  View conversation
                </Hoverable>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
