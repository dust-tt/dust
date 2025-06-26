import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import React from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { CreativityLevelSubmenu } from "@app/components/agent_builder/instructions/CreativityLevelSubmenu";
import { ModelSelectionSubmenu } from "@app/components/agent_builder/instructions/ModelSelectionSubmenu";
import { ResponseFormatSubmenu } from "@app/components/agent_builder/instructions/ResponseFormatSubmenu";
import { useModels } from "@app/lib/swr/models";
import { isSupportingResponseFormat } from "@app/types";

export function AdvancedSettings() {
  const { owner } = useAgentBuilderContext();
  const { models } = useModels({ owner });
  const { field: modelIdField } = useController<
    AgentBuilderFormData,
    "generationSettings.modelSettings.modelId"
  >({
    name: "generationSettings.modelSettings.modelId",
  });

  if (!models) {
    return null;
  }

  const supportsResponseFormat = isSupportingResponseFormat(modelIdField.value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label="Advanced settings"
          variant="outline"
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ModelSelectionSubmenu models={models} />

        <CreativityLevelSubmenu />

        {supportsResponseFormat && <ResponseFormatSubmenu />}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
