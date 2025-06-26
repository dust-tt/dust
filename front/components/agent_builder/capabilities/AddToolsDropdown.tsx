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
import { useFieldArray } from "react-hook-form";

import type {
  AgentBuilderAction,
  AgentBuilderFormData,
} from "@app/components/agent_builder/AgentBuilderFormContext";
import { getDataVisualizationActionConfiguration } from "@app/components/assistant_builder/types";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";

export function AddToolsDropdown() {
  const { fields, append } = useFieldArray<AgentBuilderFormData, "actions">({
    name: "actions",
  });

  function onClickDataVisualization() {
    const dataVisualizationConfig = getDataVisualizationActionConfiguration();
    if (!dataVisualizationConfig) {
      return;
    }

    // The configuration already has an id, but we ensure it matches our expected type
    const newAction: AgentBuilderAction = {
      ...dataVisualizationConfig,
      id: dataVisualizationConfig.id,
    };
    append(newAction);
  }

  const hasDataVisualization = fields.some(
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
