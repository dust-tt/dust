import { BellIcon, ClockIcon, Icon, TrashIcon } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";
import cronstrue from "cronstrue";
import { useState } from "react";

import {
  useRemoveTriggerSubscriber,
  useUserTriggers,
} from "@app/lib/swr/agent_triggers";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";

interface ProfileTriggersTabProps {
  owner: WorkspaceType;
}

export function ProfileTriggersTab({ owner }: ProfileTriggersTabProps) {
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const { triggers, isTriggersLoading } = useUserTriggers({
    workspaceId: owner.sId,
  });

  const [isLoading, setIsLoading] = useState(false);

  const unsubscribe = useRemoveTriggerSubscriber({
    workspaceId: owner.sId,
  });

  const getEditionURL = (agentConfigurationId: string) => {
    return getAgentBuilderRoute(
      owner.sId,
      agentConfigurationId,
      featureFlags.includes("agent_builder_v2")
    );
  };

  return (
    <>
      {isTriggersLoading ? (
        <div className="w-full p-6">
          <Spinner variant="dark" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {triggers.length === 0 && (
            <div className="text-muted-foreground">
              You are not involved with any triggers yet.
            </div>
          )}
          {triggers.map((trigger) => (
            <div
              key={trigger.sId}
              className="flex w-full flex-row items-center justify-between"
            >
              <div className="flex flex-row gap-2">
                <Icon
                  visual={trigger.kind === "schedule" ? ClockIcon : BellIcon}
                />
                <div className="flex flex-col">
                  <div className="font-medium">{trigger.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Agent: {trigger.agentName}
                  </div>
                  {trigger.kind === "schedule" && (
                    <div className="text-sm text-muted-foreground">
                      {cronstrue.toString(trigger.configuration.cron)}
                    </div>
                  )}
                </div>
              </div>
              <div className="self-end">
                {trigger.isEditor ? (
                  <Button
                    label="Manage"
                    href={getEditionURL(trigger.agentConfigurationId)}
                    variant="outline"
                    size="sm"
                  />
                ) : trigger.isSubscriber ? (
                  <Button
                    label="Unsubscribe"
                    icon={TrashIcon}
                    variant="outline"
                    size="sm"
                    isLoading={isLoading}
                    disabled={isLoading}
                    onClick={async () => {
                      setIsLoading(true);
                      await unsubscribe(
                        trigger.sId,
                        trigger.agentConfigurationId
                      );
                      setIsLoading(false);
                    }}
                  />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
