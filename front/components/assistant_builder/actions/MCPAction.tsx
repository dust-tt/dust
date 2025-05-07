import { ContentMessage, InformationCircleIcon } from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo, useState } from "react";

import { AdditionalConfigurationSection } from "@app/components/assistant_builder/actions/configuration/AdditionalConfigurationSection";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/actions/configuration/AssistantBuilderDataSourceModal";
import { ChildAgentConfigurationSection } from "@app/components/assistant_builder/actions/configuration/ChildAgentConfigurationSection";
import DataSourceSelectionSection from "@app/components/assistant_builder/actions/configuration/DataSourceSelectionSection";
import { ReasoningModelConfigurationSection } from "@app/components/assistant_builder/actions/configuration/ReasoningModelConfigurationSection";
import { TimeFrameConfigurationSection } from "@app/components/assistant_builder/actions/configuration/TimeFrameConfigurationSection";
import { MCPToolsList } from "@app/components/assistant_builder/actions/MCPToolsList";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import { MCPServerSelector } from "@app/components/assistant_builder/MCPServerSelector";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { LightWorkspaceType, SpaceType, TimeFrame } from "@app/types";
import { asDisplayName, assertNever, slugify } from "@app/types";

interface NoActionAvailableProps {
  owner: LightWorkspaceType;
}

function NoActionAvailable({ owner }: NoActionAvailableProps) {
  return (
    <ContentMessage
      title="You don't have any Tools available"
      icon={InformationCircleIcon}
      variant="warning"
    >
      <div className="flex flex-col gap-y-3">
        {(() => {
          switch (owner.role) {
            case "admin":
              return (
                <div>
                  <strong>
                    Visit the "Tools" section in the Knowledge panel to add
                    Tools.
                  </strong>
                </div>
              );
            case "builder":
            case "user":
              return (
                <div>
                  <strong>Ask your Admins to add Tools.</strong>
                </div>
              );
            case "none":
              return <></>;
            default:
              assertNever(owner.role);
          }
        })()}
      </div>
    </ContentMessage>
  );
}

interface MCPActionProps {
  owner: LightWorkspaceType;
  allowedSpaces: SpaceType[];
  action: AssistantBuilderActionConfiguration;
  isEditing: boolean;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  setEdited: (edited: boolean) => void;
}

export function MCPAction({
  owner,
  allowedSpaces,
  action,
  isEditing,
  updateAction,
  setEdited,
}: MCPActionProps) {
  const actionConfiguration =
    action.configuration as AssistantBuilderMCPServerConfiguration;

  const { mcpServerViews } = useContext(AssistantBuilderContext);

  const noMCPServerView = mcpServerViews.length === 0;

  const [selectedMCPServerView, setSelectedMCPServerView] =
    useState<MCPServerViewType | null>(
      mcpServerViews.find(
        (mcpServerView) =>
          mcpServerView.id === actionConfiguration.mcpServerViewId
      ) ?? null
    );

  // MCPServerView on default MCP server will not allow switching to another one.
  const selectedServerAvailability: MCPServerAvailability | null = useMemo(
    () => selectedMCPServerView?.server.availability ?? null,
    [selectedMCPServerView]
  );

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [showTablesModal, setShowTablesModal] = useState(false);

  const handleServerSelection = useCallback(
    (serverView: MCPServerViewType) => {
      setEdited(true);
      setSelectedMCPServerView(serverView);

      const requirements = getMCPServerRequirements(serverView);
      updateAction({
        actionName: slugify(serverView.server.name),
        actionDescription:
          requirements.requiresDataSourceConfiguration ||
          requirements.requiresTableConfiguration
            ? ""
            : serverView.server.description,
        getNewActionConfig: () => ({
          mcpServerViewId: serverView.id,
          dataSourceConfigurations: null,
          tablesConfigurations: null,
          childAgentId: null,
          reasoningModel: null,
          timeFrame: null,
          // We initialize boolean with false because leaving them unset means false (toggle on the left).
          additionalConfiguration: Object.fromEntries(
            requirements.requiredBooleans.map((key) => [key, false])
          ),
        }),
      });
    },
    [setEdited, updateAction]
  );

  const handleConfigUpdate = useCallback(
    (
      getNewConfig: (
        old: AssistantBuilderMCPServerConfiguration
      ) => AssistantBuilderMCPServerConfiguration
    ) => {
      setEdited(true);
      updateAction({
        actionName: action.name,
        actionDescription: action.description,
        getNewActionConfig: (old) =>
          getNewConfig(old as AssistantBuilderMCPServerConfiguration),
      });
    },
    [action.description, action.name, setEdited, updateAction]
  );

  if (action.type !== "MCP") {
    return null;
  }

  const requirements = getMCPServerRequirements(selectedMCPServerView);

  if (noMCPServerView) {
    return <NoActionAvailable owner={owner} />;
  }

  return (
    <>
      {/* Additional modals for selecting data sources */}
      {requirements.requiresDataSourceConfiguration && (
        <AssistantBuilderDataSourceModal
          isOpen={showDataSourcesModal}
          setOpen={setShowDataSourcesModal}
          owner={owner}
          onSave={(dataSourceConfigurations) => {
            handleConfigUpdate((old) => ({ ...old, dataSourceConfigurations }));
          }}
          initialDataSourceConfigurations={
            actionConfiguration.dataSourceConfigurations ?? {}
          }
          allowedSpaces={allowedSpaces}
          viewType="document"
        />
      )}
      {requirements.requiresTableConfiguration && (
        <AssistantBuilderDataSourceModal
          isOpen={showTablesModal}
          setOpen={(isOpen) => {
            setShowTablesModal(isOpen);
          }}
          owner={owner}
          onSave={(tablesConfigurations) => {
            handleConfigUpdate((old) => ({ ...old, tablesConfigurations }));
          }}
          initialDataSourceConfigurations={
            actionConfiguration.tablesConfigurations ?? {}
          }
          allowedSpaces={allowedSpaces}
          viewType="table"
        />
      )}
      {/* Server selection */}
      {(selectedServerAvailability === null ||
        selectedServerAvailability === "manual") &&
        (isEditing ? (
          <div className="text-sm text-foreground dark:text-foreground-night">
            <div>{selectedMCPServerView?.server.description}</div>
            <br />
            {selectedServerAvailability === "manual" && (
              <div>
                Available to you via{" "}
                <b>
                  {
                    allowedSpaces.find(
                      (space) => space.sId === selectedMCPServerView?.spaceId
                    )?.name
                  }
                </b>{" "}
                space.
              </div>
            )}

            {selectedMCPServerView && (
              <MCPToolsList tools={selectedMCPServerView.server.tools} />
            )}
          </div>
        ) : (
          <>
            <MCPServerSelector
              owner={owner}
              allowedSpaces={allowedSpaces}
              mcpServerViews={mcpServerViews}
              selectedMCPServerView={selectedMCPServerView}
              handleServerSelection={handleServerSelection}
            />
          </>
        ))}
      {/* Configurable blocks */}
      {requirements.requiresDataSourceConfiguration && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={
            actionConfiguration.dataSourceConfigurations ?? {}
          }
          openDataSourceModal={() => setShowDataSourcesModal(true)}
          onSave={(dataSourceConfigurations) => {
            handleConfigUpdate((old) => ({ ...old, dataSourceConfigurations }));
          }}
          viewType="document"
        />
      )}
      {requirements.requiresTableConfiguration && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={
            actionConfiguration.tablesConfigurations ?? {}
          }
          openDataSourceModal={() => setShowTablesModal(true)}
          onSave={(tablesConfigurations) => {
            handleConfigUpdate((old) => ({ ...old, tablesConfigurations }));
          }}
          viewType="table"
        />
      )}
      {requirements.requiresChildAgentConfiguration && (
        <ChildAgentConfigurationSection
          onAgentSelect={(childAgentId) => {
            handleConfigUpdate((old) => ({ ...old, childAgentId }));
          }}
          selectedAgentId={actionConfiguration.childAgentId}
          owner={owner}
        />
      )}
      {requirements.requiresReasoningConfiguration && (
        <ReasoningModelConfigurationSection
          onModelSelect={(reasoningModel) => {
            handleConfigUpdate((old) => ({ ...old, reasoningModel }));
          }}
          selectedReasoningModel={actionConfiguration.reasoningModel}
          owner={owner}
        />
      )}
      {requirements.requiresTimeFrameConfiguration && (
        <TimeFrameConfigurationSection
          onConfigUpdate={(timeFrame: TimeFrame | null) => {
            handleConfigUpdate((old) => ({ ...old, timeFrame }));
          }}
          timeFrame={actionConfiguration.timeFrame}
        />
      )}
      <AdditionalConfigurationSection
        {...requirements}
        additionalConfiguration={actionConfiguration.additionalConfiguration}
        onConfigUpdate={(key, value) => {
          handleConfigUpdate((old) => ({
            ...old,
            additionalConfiguration: {
              ...old.additionalConfiguration,
              [key]: value,
            },
          }));
        }}
      />
    </>
  );
}

export function hasErrorActionMCP(
  action: AssistantBuilderActionConfiguration,
  mcpServerViews: MCPServerViewType[]
): string | null {
  if (action.type === "MCP") {
    const mcpServerView = mcpServerViews.find(
      (mcpServerView) =>
        mcpServerView.id === action.configuration.mcpServerViewId
    );
    if (!mcpServerView) {
      return "Please select a tool.";
    }

    const requirements = getMCPServerRequirements(mcpServerView);
    if (
      requirements.requiresDataSourceConfiguration &&
      !action.configuration.dataSourceConfigurations
    ) {
      return "Please select one or multiple data sources.";
    }
    if (
      requirements.requiresTableConfiguration &&
      !action.configuration.tablesConfigurations
    ) {
      return "Please select one or multiple tables.";
    }
    if (
      requirements.requiresChildAgentConfiguration &&
      !action.configuration.childAgentId
    ) {
      return "Please select a child agent.";
    }
    const missingFields = [];
    for (const key of requirements.requiredStrings) {
      if (!(key in action.configuration.additionalConfiguration)) {
        missingFields.push(key);
      }
    }
    for (const key of requirements.requiredNumbers) {
      if (!(key in action.configuration.additionalConfiguration)) {
        missingFields.push(key);
      }
    }
    for (const key in requirements.requiredEnums) {
      if (!(key in action.configuration.additionalConfiguration)) {
        missingFields.push(key);
      }
    }
    if (missingFields.length > 0) {
      return `Some fields are missing: ${missingFields.map(asDisplayName).join(", ")}.`;
    }

    return null;
  }
  return "Please select a tool.";
}
