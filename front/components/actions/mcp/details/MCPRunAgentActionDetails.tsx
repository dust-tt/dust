import { Avatar, Button, RobotIcon } from "@dust-tt/sparkle";
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
      actionName="Run agent"
      defaultOpen={defaultOpen}
      visual={RobotIcon}
    >
      <div className="flex flex-col gap-4 pl-6 pt-4">
        <div className="flex flex-col gap-2">
          {query && childAgent && (
            <>
              <div className="flex items-center gap-2">
                <Avatar
                  name={childAgent.name}
                  visual={childAgent.pictureUrl}
                  busy={isBusy}
                  disabled={false}
                  size="xs"
                />
                <div>
                  {conversationUrl && (
                    <Button
                      label="View conversation"
                      variant="outline"
                      onClick={() => window.open(conversationUrl, "_blank")}
                      size="xs"
                      className="!p-1"
                    />
                  )}
                </div>
              </div>
              <div className="text-sm font-normal text-foreground dark:text-foreground-night">
                <span className="font-bold">Query: </span>{" "}
                <span className="text-muted-foreground dark:text-muted-foreground-night">
                  {query}
                </span>
              </div>
            </>
          )}
          {response && childAgent && (
            <>
              <div className="text-sm font-normal text-foreground dark:text-foreground-night">
                <span className="font-bold">Response: </span> {response}
              </div>
            </>
          )}
        </div>
      </div>
    </ActionDetailsWrapper>
  );
}
