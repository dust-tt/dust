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
import { useController } from "react-hook-form";

import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { SlackSettingsSheet } from "@app/components/agent_builder/settings/SlackSettingsSheet";
import { SettingSectionContainer } from "@app/components/agent_builder/shared/SettingSectionContainer";

export function VisibilitySection() {
  const { field } = useController<AgentBuilderFormData, "agentSettings.scope">({
    name: "agentSettings.scope",
  });
  const [showSlackSettings, setShowSlackSettings] = useState(false);
  const getDisplayValue = () => {
    return field.value === "visible" ? "Published" : "Unpublished";
  };

  const getDisplayIcon = () => {
    return field.value === "visible" ? EyeIcon : EyeSlashIcon;
  };

  return (
    <SettingSectionContainer title="Visibility">
      <div className="mt-2 flex items-center gap-2">
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
              onClick={() => field.onChange("visible")}
            />
            <DropdownMenuItem
              label="Unpublished"
              description="Visible & usable by editors only."
              icon={EyeSlashIcon}
              onClick={() => field.onChange("hidden")}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          className={field.value === "visible" ? "" : "hidden"}
          variant="outline"
          label="Slack preferences"
          icon={SlackLogo}
          onClick={() => setShowSlackSettings(true)}
          type="button"
        />
        <SlackSettingsSheet
          isOpen={showSlackSettings}
          onOpenChange={() => setShowSlackSettings(false)}
        />
      </div>
    </SettingSectionContainer>
  );
}
