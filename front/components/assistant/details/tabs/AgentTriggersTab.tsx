import { BellIcon, ClockIcon, Icon, Page, PlusIcon } from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import { Spinner } from "@dust-tt/sparkle";

import { useAgentTriggers } from "@app/lib/swr/agent_triggers";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { getAgentBuilderRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types";
import type { LightAgentConfigurationType } from "@app/types";
import { isAdmin } from "@app/types";

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

  const canEditAssistant = agentConfiguration.canEdit || isAdmin(owner);

  return (
    <>
      <div className="flex flex-row items-center justify-between gap-3">
        <Page.H variant="h5">Triggers</Page.H>
        <div className="self-end">
          {canEditAssistant && (
            <Button
              icon={PlusIcon}
              label="Create Trigger"
              href={getAgentBuilderRoute(
                owner.sId,
                agentConfiguration.sId,
                featureFlags.includes("agent_builder_v2")
              )}
              variant="ghost"
              size="sm"
            />
          )}
        </div>
      </div>

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
                <div className="font-medium">{trigger.name}</div>
              </div>
              <div className="self-end">
                {false && (
                  <Button
                    label="Subscribe"
                    href=""
                    variant="outline"
                    size="sm"
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
