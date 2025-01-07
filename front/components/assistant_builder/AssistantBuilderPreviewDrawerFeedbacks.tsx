import {
  Avatar,
  Button,
  ExternalLinkIcon,
  HandThumbDownIcon,
  HandThumbUpIcon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  LightAgentConfigurationType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { memo, useCallback, useEffect, useRef } from "react";

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
    hasMore: feedbacksNotExhausted,
    setSize,
    size,
  } = useAgentConfigurationFeedbacksByDescVersion({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfigurationId,
    limit: FEEDBACKS_PAGE_SIZE,
  });

  // Intersection observer to detect when the user has scrolled to the bottom of the list.
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0];
        if (
          target.isIntersecting &&
          !isValidating &&
          !isAgentConfigurationFeedbacksLoading &&
          feedbacksNotExhausted
        ) {
          void setSize(size + 1);
        }
      },
      {
        threshold: 0.25,
      }
    );

    if (bottomRef.current) {
      observer.observe(bottomRef.current);
    }

    return () => observer.disconnect();
  }, [
    bottomRef,
    isValidating,
    isAgentConfigurationFeedbacksLoading,
    agentConfigurationFeedbacks,
    setSize,
    size,
    feedbacksNotExhausted,
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
    return <Spinner />;
  }

  if (
    !isAgentConfigurationFeedbacksLoading &&
    (!agentConfigurationFeedbacks || agentConfigurationFeedbacks.length === 0)
  ) {
    return <div className="mt-3 text-sm text-element-900">No feedbacks.</div>;
  }

  if (!agentConfigurationHistory) {
    return (
      <div className="mt-3 text-sm text-element-900">
        Error loading the previous agent versions.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex flex-col">
        <AgentConfigurationVersionHeader
          agentConfiguration={agentConfigurationHistory[0]}
          agentConfigurationVersion={agentConfigurationHistory[0].version}
          isLatestVersion={true}
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
              {!previousFeedbackHasDifferentVersion && !isFirstFeedback && (
                <div className="mx-4 my-1">
                  <Page.Separator />
                </div>
              )}
              <div className="mr-2">
                <MemoizedFeedbackCard
                  owner={owner}
                  feedback={feedback as AgentMessageFeedbackWithMetadataType}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* Invisible div to act as a scroll anchor for detecting when the user has scrolled to the bottom */}
      <div ref={bottomRef} className="h-1.5" />
    </div>
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
      return formatTimestampToFriendlyDate(versionDate.getTime(), "long");
    },
    [isLatestVersion]
  );

  return (
    <div className="mb-2 mt-4 text-sm font-medium">
      {agentConfiguration
        ? getAgentConfigurationVersionString(agentConfiguration)
        : `v${agentConfigurationVersion}`}
    </div>
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
    <div className="rounded-lg p-2">
      <div className="justify-content-around flex items-center">
        <div className="flex w-full items-center gap-2">
          {feedback.userImageUrl ? (
            <Avatar
              size="xs"
              visual={feedback.userImageUrl}
              name={feedback.userName}
            />
          ) : (
            <Spinner size="xs" />
          )}
          <div className="flex-grow text-sm font-medium text-element-900">
            {feedback.userName}
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-row items-center text-xs text-muted-foreground">
          {timeSinceFeedback} ago
          <div className="flex h-8 w-8 items-center justify-center rounded">
            {feedback.thumbDirection === "up" ? (
              <HandThumbUpIcon />
            ) : (
              <HandThumbDownIcon />
            )}
          </div>
        </div>

        <Button
          variant="ghost"
          size="xs"
          href={conversationUrl ?? ""}
          icon={ExternalLinkIcon}
          disabled={!conversationUrl}
          target="_blank"
        />
      </div>
      {feedback.content && (
        <div className="my-2 ml-4 flex items-center">
          <div className="flex-grow text-sm leading-relaxed text-gray-700">
            {feedback.content}
          </div>
        </div>
      )}
    </div>
  );
}
