import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EyeIcon,
  EyeSlashIcon,
  SlackLogo,
} from "@dust-tt/sparkle";
import { useState } from "react";
import React from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { SlackSettingsSheet } from "@app/components/agent_builder/settings/SlackSettingsSheet";
import { SettingSectionContainer } from "@app/components/agent_builder/shared/SettingSectionContainer";
import { EditorsSheet } from "@app/components/shared/EditorsSheet";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import { isBuilder } from "@app/types";

export function AccessSection() {
  const { field: scope } = useController<
    AgentBuilderFormData,
    "agentSettings.scope"
  >({
    name: "agentSettings.scope",
  });

  const {
    field: { value: slackProvider },
  } = useController<AgentBuilderFormData, "agentSettings.slackProvider">({
    name: "agentSettings.slackProvider",
  });

  const {
    field: { value: editors, onChange: onChangeEditors },
  } = useController<AgentBuilderFormData, "agentSettings.editors">({
    name: "agentSettings.editors",
  });

  const [showSlackSettings, setShowSlackSettings] = useState(false);

  const { supportedDataSourceViews } = useDataSourceViewsContext();
  const { owner } = useAgentBuilderContext();
  const { featureFlags } = useFeatureFlags({ workspaceId: owner.sId });

  const restrictAgentsPublishing = featureFlags.includes(
    "restrict_agents_publishing"
  );
  const publishingToggleDisabled =
    restrictAgentsPublishing && !isBuilder(owner);

  const getDisplayValue = () => {
    return scope.value === "visible" ? "Published" : "Unpublished";
  };

  const getDisplayIcon = () => {
    return scope.value === "visible" ? EyeIcon : EyeSlashIcon;
  };

  const slackDataSource = slackProvider
    ? supportedDataSourceViews.find(
        (dsv) => dsv.dataSource.connectorProvider === slackProvider
      )?.dataSource
    : null;

  return (
    <SettingSectionContainer title="Editors & Access">
      <div className="mt-2 flex w-full flex-row flex-wrap items-center gap-2">
        <EditorsSheet
          owner={owner}
          editors={editors || []}
          onChangeEditors={onChangeEditors}
          description="People who can use and edit the agent."
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              icon={getDisplayIcon()}
              label={getDisplayValue()}
              isSelect
              type="button"
              disabled={publishingToggleDisabled}
              tooltip={
                publishingToggleDisabled
                  ? "Publishing agents is restricted to builders and admins"
                  : undefined
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              label="Published"
              description="Visible & usable by all members of the workspace."
              icon={EyeIcon}
              onClick={() => scope.onChange("visible")}
              disabled={publishingToggleDisabled}
            />
            <DropdownMenuItem
              label="Unpublished"
              description="Visible & usable by editors only."
              icon={EyeSlashIcon}
              onClick={() => scope.onChange("hidden")}
              disabled={publishingToggleDisabled}
            />
          </DropdownMenuContent>
        </DropdownMenu>

        {scope.value === "visible" && slackDataSource && (
          <>
            <Button
              variant="outline"
              label="Slack preferences"
              icon={SlackLogo}
              onClick={() => setShowSlackSettings(true)}
              type="button"
            />
            <SlackSettingsSheet
              isOpen={showSlackSettings}
              onOpenChange={() => setShowSlackSettings(false)}
              slackDataSource={slackDataSource}
            />
          </>
        )}
      </div>
    </SettingSectionContainer>
  );
}
