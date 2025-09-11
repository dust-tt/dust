import {
  ArrowRightIcon,
  Avatar,
  BellIcon,
  ClockIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useState } from "react";

import {
  useAddTriggerSubscriber,
  useAgentTriggers,
  useRemoveTriggerSubscriber,
} from "@app/lib/swr/agent_triggers";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";
import type { LightAgentConfigurationType } from "@app/types";

interface AgentTriggersTabProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
}

export function AgentTriggersTab({
  agentConfiguration,
  owner,
}: AgentTriggersTabProps) {
  const { triggers, isTriggersLoading } = useAgentTriggers({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });

  const [isLoading, setIsLoading] = useState(false);

  const subscribe = useAddTriggerSubscriber({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });
  const unsubscribe = useRemoveTriggerSubscriber({
    workspaceId: owner.sId,
    agentConfigurationId: agentConfiguration.sId,
  });

  const editionURL = getAgentBuilderRoute(owner.sId, agentConfiguration.sId);

  return (
    <>
      {isTriggersLoading ? (
        <div className="w-full p-6">
          <Spinner variant="dark" />
        </div>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {triggers.length === 0 && (
            <div className="text-muted-foreground">
              No triggers setup for this agent, yet.
            </div>
          )}
          {triggers.map((trigger) => (
            <div
              key={trigger.sId}
              className="flex w-full flex-row items-center justify-between border-b pb-2"
            >
              <div className="flex w-full flex-col gap-1">
                <div className="flex w-full flex-row items-center justify-between gap-4">
                  <div className="flex flex-row items-center gap-2">
                    <Avatar
                      size="xs"
                      visual={
                        trigger.kind === "schedule" ? (
                          <ClockIcon />
                        ) : (
                          <BellIcon />
                        )
                      }
                    />
                    <div className="font-semibold">{trigger.name}</div>
                  </div>
                  <div className="self-end">
                    {trigger.isEditor ? (
                      <Button
                        label="Manage"
                        icon={PencilSquareIcon}
                        href={editionURL}
                        variant="outline"
                        size="sm"
                      />
                    ) : trigger.isSubscriber ? (
                      <Button
                        label="Unsubscribe"
                        icon={XMarkIcon}
                        variant="outline"
                        size="sm"
                        isLoading={isLoading}
                        disabled={isLoading}
                        onClick={async () => {
                          setIsLoading(true);
                          await unsubscribe(trigger.sId);
                          setIsLoading(false);
                        }}
                      />
                    ) : (
                      <Button
                        label="Subscribe"
                        icon={ArrowRightIcon}
                        variant="outline"
                        size="sm"
                        isLoading={isLoading}
                        disabled={isLoading}
                        onClick={async () => {
                          setIsLoading(true);
                          await subscribe(trigger.sId);
                          setIsLoading(false);
                        }}
                      />
                    )}
                  </div>
                </div>
                {trigger.kind === "schedule" && (
                  <div className="text-sm text-muted-foreground">
                    Runs {cronstrue.toString(trigger.configuration.cron)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
