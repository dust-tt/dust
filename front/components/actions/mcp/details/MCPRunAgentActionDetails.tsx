import {
  Avatar,
  Button,
  ContentMessage,
  Markdown,
  RobotIcon,
} from "@dust-tt/sparkle";
import { ExternalLinkIcon } from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { ActionDetailsWrapper } from "@app/components/actions/ActionDetailsWrapper";
import type { MCPActionDetailsProps } from "@app/components/actions/mcp/details/MCPActionDetails";
import {
  isRunAgentChainOfThoughtProgressOutput,
  isRunAgentGenerationTokensProgressOutput,
  isRunAgentProgressOutput,
  isRunAgentQueryProgressOutput,
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
      const output = lastNotification.data.output;
      if (isRunAgentProgressOutput(output)) {
        return output.childAgentId;
      }
    }
    return null;
  }, [queryResource, lastNotification]);

  const [query, setQuery] = useState<string | null>(null);
  const [streamedChainOfThought, setStreamedChainOfThought] = useState<
    string | null
  >(null);
  const [streamedResponse, setStreamedResponse] = useState<string | null>(null);

  useEffect(() => {
    if (queryResource) {
      setQuery(queryResource.resource.text);
    }
    if (lastNotification?.data.output) {
      const output = lastNotification.data.output;
      if (isRunAgentQueryProgressOutput(output) && !query) {
        setQuery(output.query);
      } else if (isRunAgentChainOfThoughtProgressOutput(output)) {
        setStreamedChainOfThought(output.chainOfThought);
      } else if (isRunAgentGenerationTokensProgressOutput(output)) {
        setStreamedResponse(output.text);
      }
    }
  }, [queryResource, lastNotification, query]);

  const response = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.text;
    }
    return streamedResponse;
  }, [resultResource, streamedResponse]);

  const chainOfThought = useMemo(() => {
    if (resultResource && resultResource.resource.chainOfThought) {
      return resultResource.resource.chainOfThought;
    }
    return streamedChainOfThought;
  }, [resultResource, streamedChainOfThought]);

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
    return isBusy && chainOfThought !== null && response === null;
  }, [isBusy, chainOfThought, response]);

  const isStreamingResponse = useMemo(() => {
    return isBusy && response !== null && !resultResource;
  }, [isBusy, response, resultResource]);

  const conversationUrl = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.uri;
    }
    const output = lastNotification?.data.output;
    if (isRunAgentProgressOutput(output)) {
      return `/w/${owner.sId}/assistant/${output.conversationId}`;
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
                  isStreaming={isStreamingResponse}
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
