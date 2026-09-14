import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { AgentBuilderSectionContainer } from "@app/components/agent_builder/AgentBuilderSectionContainer";
import { AdvancedSettings } from "@app/components/agent_builder/instructions/AdvancedSettings";
import { AgentBuilderInstructionsEditor } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { AgentInstructionsHistory } from "@app/components/agent_builder/instructions/AgentInstructionsHistory";
import { useAgentConfigurationHistory } from "@app/lib/swr/assistants";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import {
  Button,
  Label,
  RefreshCw02,
  Separator,
  XClose,
} from "@dust-tt/sparkle";
import { format } from "date-fns/format";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React, { useState } from "react";
import { useFormContext } from "react-hook-form";

const DEFAULT_INSTRUCTIONS_HISTORY_LIMIT = 50;
const INSTRUCTIONS_HISTORY_LIMIT_STORAGE_KEY =
  "dust_instructions_history_limit";

function readInstructionsHistoryLimit(): number {
  if (typeof window === "undefined") {
    return DEFAULT_INSTRUCTIONS_HISTORY_LIMIT;
  }
  try {
    const raw = localStorage.getItem(INSTRUCTIONS_HISTORY_LIMIT_STORAGE_KEY);
    const parsed = Number.parseInt(raw ?? "", 10);

    return parsed > 0 ? parsed : DEFAULT_INSTRUCTIONS_HISTORY_LIMIT;
  } catch {
    // localStorage unavailable.
    return DEFAULT_INSTRUCTIONS_HISTORY_LIMIT;
  }
}

// Escape hatch for users who want a higher limit They can run e.g.
// localStorage.setItem("dust_instructions_history_limit", "100")
// And to go back to default:
// localStorage.removeItem("dust_instructions_history_limit")
const INSTRUCTIONS_HISTORY_LIMIT = readInstructionsHistoryLimit();

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
    limit: INSTRUCTIONS_HISTORY_LIMIT,
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

  const headerActions = <>{!isInstructionDiffMode && <AdvancedSettings />}</>;

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
              icon={XClose}
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
              icon={RefreshCw02}
              onClick={restoreVersion}
              label="Restore this version"
            />
          </div>
        </>
      )}
      <AgentBuilderInstructionsEditor
        compareVersion={compareVersion}
        isInstructionDiffMode={isInstructionDiffMode}
      >
        {agentConfigurationHistory && agentConfigurationHistory.length > 1 && (
          <AgentBuilderInstructionsEditor.ToolbarSlot>
            <AgentInstructionsHistory
              history={agentConfigurationHistory}
              selectedConfig={compareVersion}
              onSelect={(config) => {
                setCompareVersion(config);
                setIsInstructionDiffMode(true);
              }}
              owner={owner}
            />
          </AgentBuilderInstructionsEditor.ToolbarSlot>
        )}
      </AgentBuilderInstructionsEditor>
    </AgentBuilderSectionContainer>
  );
}
