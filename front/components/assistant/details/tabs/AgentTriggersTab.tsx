import {
  BellIcon,
  ClockIcon,
  Icon,
  Page,
  PlusIcon,
  TrashIcon,
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
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";
import type { LightAgentConfigurationType } from "@app/types";
import { isAdmin, pluralize } from "@app/types";

interface AgentTriggersTabProps {
  agentConfiguration: LightAgentConfigurationType;
  owner: WorkspaceType;
}

export function AgentTriggersTab({
  agentConfiguration,
  owner,
}: AgentTriggersTabProps) {
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

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

  const canEditAssistant = agentConfiguration.canEdit || isAdmin(owner);
  const editionURL = getAgentBuilderRoute(
    owner.sId,
    agentConfiguration.sId,
    featureFlags.includes("agent_builder_v2")
  );

  return (
    <>
      {canEditAssistant && (
        <div className="flex flex-row items-center justify-between gap-3">
          <Page.H variant="h5">Trigger{pluralize(triggers.length)}</Page.H>
          <div className="self-end">
            <Button
              icon={PlusIcon}
              label="Create Trigger"
              href={editionURL}
              variant="ghost"
              size="sm"
            />
          </div>
        </div>
      )}

      {isTriggersLoading ? (
        <div className="w-full p-6">
          <Spinner variant="dark" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {triggers.length === 0 && (
            <div className="text-muted-foreground">
              No triggers setup for this agent, yet.
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
                    href={editionURL}
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
                      await unsubscribe(trigger.sId);
                      setIsLoading(false);
                    }}
                  />
                ) : (
                  <Button
                    label="Subscribe"
                    icon={PlusIcon}
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
          ))}
        </div>
      )}
    </>
  );
}
