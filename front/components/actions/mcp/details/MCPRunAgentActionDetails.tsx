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
import type { ActionDetailsComponentBaseProps } from "@app/components/actions/types";
import type { MCPActionType } from "@app/lib/actions/mcp";
import {
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
}: ActionDetailsComponentBaseProps<MCPActionType>) {
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
    }
    return null;
  }, [queryResource, lastNotification]);

  const query = useMemo(() => {
    if (queryResource) {
      return queryResource.resource.text;
    }
    if (isRunAgentProgressOutput(lastNotification?.data.output)) {
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

  const isBusy = useMemo(() => {
    if (resultResource) {
      return false;
    }
    return true;
  }, [resultResource]);

  const conversationUrl = useMemo(() => {
    if (resultResource) {
      return resultResource.resource.uri;
    }
    if (isRunAgentProgressOutput(lastNotification?.data.output)) {
      return `/w/${owner.sId}/assistant/${lastNotification.data.output.conversationId}`;
    }
    return null;
  }, [resultResource, lastNotification, owner.sId]);

  const { agentConfiguration: childAgent } = useAgentConfiguration({
    workspaceId: owner.sId,
    agentConfigurationId: childAgentId,
  });
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
              <ContentMessage title="Query" variant="outline" size="lg">
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
