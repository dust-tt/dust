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
import { uniqueId } from "lodash";

import { useAgentBuilderCapabilitiesContext } from "@app/components/agent_builder/capabilities/AgentBuilderCapabilitiesContext";
import { getDataVisualizationActionConfiguration } from "@app/components/assistant_builder/types";
import { DATA_VISUALIZATION_SPECIFICATION } from "@app/lib/actions/utils";

export function AddToolsDropdown() {
  const { actions, setActions } = useAgentBuilderCapabilitiesContext();

  function onClickDataVisualization() {
    const dataVisualizationConfig = getDataVisualizationActionConfiguration();
    if (!dataVisualizationConfig) {
      return;
    }

    const newAction = {
      ...dataVisualizationConfig,
      id: uniqueId(),
    };

    setActions((prevActions) => [...prevActions, newAction]);
  }

  const hasDataVisualization = actions.some(
    (action) => action.type === "DATA_VISUALIZATION"
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
