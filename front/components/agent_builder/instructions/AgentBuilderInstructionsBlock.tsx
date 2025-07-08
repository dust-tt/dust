import {
  ArrowPathIcon,
  Button,
  Label,
  Page,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AdvancedSettings } from "@app/components/agent_builder/instructions/AdvancedSettings";
import { AgentBuilderInstructionsEditor } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { AgentInstructionsHistory } from "@app/components/agent_builder/instructions/AgentInstructionsHistory";
import { useAgentConfigurationHistory } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types";

interface AgentBuilderInstructionsBlockProps {
  agentConfigurationId: string | null;
}

export function AgentBuilderInstructionsBlock({
  agentConfigurationId,
}: AgentBuilderInstructionsBlockProps) {
  const { owner } = useAgentBuilderContext();
  const { setValue } = useFormContext<AgentBuilderFormData>();
  const [compareVersion, setCompareVersion] =
    useState<LightAgentConfigurationType | null>(null);
  const [isInstructionDiffMode, setIsInstructionDiffMode] = useState(false);

  const { agentConfigurationHistory } = useAgentConfigurationHistory({
    workspaceId: owner.sId,
    agentConfigurationId,
    disabled: !agentConfigurationId,
    limit: 30,
  });

  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });

  const restoreVersion = () => {
    const text = compareVersion?.instructions;
    if (!text) {
      return;
    }

    setValue("instructions", text, { shouldDirty: true });
    setCompareVersion(null);
    setIsInstructionDiffMode(false);
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <Page.H>Instructions</Page.H>
      <div className="flex flex-col items-center justify-between sm:flex-row">
        <Page.P>
          <span className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Command or guideline you provide to your agent to direct its
            responses.
          </span>
        </Page.P>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <div className="flex items-center gap-2">
            {!isInstructionDiffMode && <AdvancedSettings />}
            {agentConfigurationHistory &&
              agentConfigurationHistory.length > 1 && (
                <AgentInstructionsHistory
                  history={agentConfigurationHistory}
                  selectedConfig={compareVersion}
                  onSelect={(config) => {
                    setCompareVersion(config);
                    setIsInstructionDiffMode(true);
                  }}
                  owner={owner}
                  agentConfigurationId={agentConfigurationId}
                />
              )}
          </div>
        </div>
      </div>

      {isInstructionDiffMode && compareVersion && (
        <>
          <Separator />
          {compareVersion?.versionCreatedAt && (
            <Label>
              Comparing current version with{" "}
              {dateFormatter.format(new Date(compareVersion.versionCreatedAt))}
            </Label>
          )}
          <div className="flex gap-2">
            <Button
              icon={XMarkIcon}
              variant="outline"
              size="sm"
              onClick={() => {
                setIsInstructionDiffMode(false);
                setCompareVersion(null);
              }}
              label="Leave comparison mode"
            />
            <Button
              variant="warning"
              size="sm"
              icon={ArrowPathIcon}
              onClick={restoreVersion}
              label="Restore this version"
            />
          </div>
        </>
      )}
      <AgentBuilderInstructionsEditor
        compareVersion={compareVersion}
        isInstructionDiffMode={isInstructionDiffMode}
      />
    </div>
  );
}
