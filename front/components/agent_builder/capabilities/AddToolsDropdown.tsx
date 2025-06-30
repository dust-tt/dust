import {
  Avatar,
  BoltIcon,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";
import type { FieldArray, FieldArrayWithId } from "react-hook-form";

import type { AgentBuilderAction } from "@app/components/agent_builder/types";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDataVisualizationActionConfiguration } from "@app/components/assistant_builder/types";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";

interface AddToolsDropdownProps {
  tools: FieldArrayWithId<AgentBuilderFormData, "actions">[];
  addTools: (
    value:
      | FieldArray<AgentBuilderFormData, "actions">
      | FieldArray<AgentBuilderFormData, "actions">[]
  ) => void;
}

export function AddToolsDropdown({ tools, addTools }: AddToolsDropdownProps) {
  function onClickDataVisualization() {
    const dataVisualizationConfig = getDataVisualizationActionConfiguration();
    if (!dataVisualizationConfig) {
      return;
    }

    // Convert to the agent builder action format
    const newAction: AgentBuilderAction = {
      id: dataVisualizationConfig.id,
      type: "DATA_VISUALIZATION",
      name: dataVisualizationConfig.name,
      description: dataVisualizationConfig.description,
      noConfigurationRequired: dataVisualizationConfig.noConfigurationRequired,
      configuration: {
        type: "DATA_VISUALIZATION",
      },
    };
    addTools(newAction);
  }

  const hasDataVisualization = tools.some(
    (action: AgentBuilderAction) => action.type === "DATA_VISUALIZATION"
  );

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label="Add tools"
          icon={BoltIcon}
          size="sm"
          isSelect
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {hasDataVisualization ? (
          <DropdownMenuLabel label="All tools have been added" />
        ) : (
          <>
            <DropdownMenuLabel label="Available tools" />
            <DropdownMenuItem
              truncateText
              icon={
                <Avatar
                  icon={DATA_VISUALIZATION_SPECIFICATION.dropDownIcon}
                  size="sm"
                />
              }
              label={DATA_VISUALIZATION_SPECIFICATION.label}
              description={DATA_VISUALIZATION_SPECIFICATION.description}
              onClick={onClickDataVisualization}
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
