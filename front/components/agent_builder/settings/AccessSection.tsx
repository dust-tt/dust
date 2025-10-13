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

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { EditorsSheet } from "@app/components/agent_builder/settings/EditorsSheet";
import { SlackSettingsSheet } from "@app/components/agent_builder/settings/SlackSettingsSheet";
import { SettingSectionContainer } from "@app/components/agent_builder/shared/SettingSectionContainer";

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

  const [showSlackSettings, setShowSlackSettings] = useState(false);

  const { supportedDataSourceViews } = useDataSourceViewsContext();

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
      <div className="mt-2 flex items-center gap-2">
        <EditorsSheet />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              icon={getDisplayIcon()}
              label={getDisplayValue()}
              isSelect
              type="button"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              label="Published"
              description="Visible & usable by all members of the workspace."
              icon={EyeIcon}
              onClick={() => scope.onChange("visible")}
            />
            <DropdownMenuItem
              label="Unpublished"
              description="Visible & usable by editors only."
              icon={EyeSlashIcon}
              onClick={() => scope.onChange("hidden")}
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
