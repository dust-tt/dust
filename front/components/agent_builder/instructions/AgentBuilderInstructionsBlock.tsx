import {
  ArrowPathIcon,
  Button,
  Label,
  Separator,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { format } from "date-fns/format";
import React, { useState } from "react";
import { useFormContext } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
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

  const restoreVersion = () => {
    const text = compareVersion?.instructions;
    if (!text) {
      return;
    }

    setValue("instructions", text, { shouldDirty: true, shouldValidate: true });
    setCompareVersion(null);
    setIsInstructionDiffMode(false);
  };

  const headerActions = (
    <>
      {!isInstructionDiffMode && <AdvancedSettings />}
      {agentConfigurationHistory && agentConfigurationHistory.length > 1 && (
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
    </>
  );

  return (
    <AgentBuilderSectionContainer
      title="Instructions"
      description="Command or guideline you provide to your agent to direct its responses."
      headerActions={headerActions}
    >
      {isInstructionDiffMode && compareVersion && (
        <>
          <Separator />
          {compareVersion?.versionCreatedAt && (
            <Label>
              Comparing current version with{" "}
              {format(compareVersion.versionCreatedAt, "Pp")}
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
    </AgentBuilderSectionContainer>
  );
}
