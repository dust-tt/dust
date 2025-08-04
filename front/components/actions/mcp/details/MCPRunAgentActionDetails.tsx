import {
  Avatar,
  Button,
  ContentMessage,
  Markdown,
  RobotIcon,
} from "@dust-tt/sparkle";
import { ExternalLinkIcon } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/components/actions/mcp/details/MCPActionDetails";
import {
  isRunAgentChainOfThoughtProgressOutput,
  isRunAgentProgressOutput,
  isRunAgentQueryResourceType,
  isRunAgentResultResourceType,
} from "@app/lib/actions/mcp_internal_actions/output_schemas";
import { useAgentConfiguration } from "@app/lib/swr/assistants";

export function MCPRunAgentActionDetails({
  owner,
  action,
  lastNotification,
  defaultOpen,
}: MCPActionDetailsProps) {
  const queryResource =
    action.output?.find(isRunAgentQueryResourceType) || null;

  const resultResource =
    action.output?.find(isRunAgentResultResourceType) || null;

  const childAgentId = useMemo(() => {
    if (queryResource) {
      return queryResource.resource.childAgentId;
    }
    if (lastNotification) {
      if (isRunAgentProgressOutput(lastNotification.data.output)) {
        return lastNotification.data.output.childAgentId;
      }
      if (isRunAgentChainOfThoughtProgressOutput(lastNotification.data.output)) {
        return lastNotification.data.output.childAgentId;
      }
    }
    return null;
  }, [queryResource, lastNotification]);

  const query = useMemo(() => {
    // Always prefer the queryResource if available (from action.output)
    if (queryResource) {
      return queryResource.resource.text;
    }
    // Fall back to notification data if no queryResource yet
    if (isRunAgentProgressOutput(lastNotification?.data.output)) {
      return lastNotification.data.output.query;
    }
    if (isRunAgentChainOfThoughtProgressOutput(lastNotification?.data.output)) {
      return lastNotification.data.output.query;
    }
    return null;
  }, [queryResource, lastNotification]);

  const response = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.text;
    }
    return null;
  }, [resultResource]);

  const chainOfThought = useMemo(() => {
    // Priority 1: Final result chain of thought (complete)
    if (resultResource && resultResource.resource.chainOfThought) {
      return resultResource.resource.chainOfThought;
    }
    // Priority 2: Streaming chain of thought from notifications
    if (isRunAgentChainOfThoughtProgressOutput(lastNotification?.data.output)) {
      return lastNotification.data.output.chainOfThought;
    }
    return null;
  }, [resultResource, lastNotification]);

  const { agentConfiguration: childAgent } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: childAgentId,
  });

  const isBusy = useMemo(() => {
    if (resultResource) {
      return false;
    }
    return true;
  }, [resultResource]);

  const isStreamingChainOfThought = useMemo(() => {
    return isBusy && chainOfThought !== null;
  }, [isBusy, chainOfThought]);

  const conversationUrl = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.uri;
    }
    if (isRunAgentProgressOutput(lastNotification?.data.output)) {
      return `/w/${owner.sId}/assistant/${lastNotification.data.output.conversationId}`;
    }
    if (isRunAgentChainOfThoughtProgressOutput(lastNotification?.data.output)) {
      return `/w/${owner.sId}/assistant/${lastNotification.data.output.conversationId}`;
    }
    return null;
  }, [resultResource, lastNotification, owner.sId]);
  return (
    <ActionDetailsWrapper
      actionName={childAgent?.name ? `Run @${childAgent.name}` : "Run Agent"}
      defaultOpen={defaultOpen}
      visual={
        childAgent?.pictureUrl
          ? () => (
              <Avatar visual={childAgent.pictureUrl} size="sm" busy={isBusy} />
            )
          : RobotIcon
      }
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-4">
          {query && childAgent && (
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              <ContentMessage title="Query" variant="primary" size="lg">
                <Markdown
                  content={query}
                  isStreaming={false}
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground"
                  isLastMessage={false}
                />
              </ContentMessage>
            </div>
          )}
          {chainOfThought && childAgent && (
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              <ContentMessage
                title="Agent thoughts"
                variant="primary"
                size="lg"
              >
                <Markdown
                  content={chainOfThought}
                  isStreaming={isStreamingChainOfThought}
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground"
                  isLastMessage={false}
                />
              </ContentMessage>
            </div>
          )}
          {response && childAgent && (
            <div className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              <ContentMessage title="Response" variant="primary" size="lg">
                <Markdown
                  content={response}
                  isStreaming={false}
                  forcedTextSize="text-sm"
                  textColor="text-muted-foreground"
                  isLastMessage={false}
                />
              </ContentMessage>
            </div>
          )}
        </div>
        <div>
          {conversationUrl && (
            <Button
              icon={ExternalLinkIcon}
              label="View full conversation"
              variant="outline"
              onClick={() => window.open(conversationUrl, "_blank")}
              size="xs"
              className="!p-1"
            />
          )}
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
