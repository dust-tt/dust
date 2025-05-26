import { ContentMessage, InformationCircleIcon } from "@dust-tt/sparkle";
import { useCallback, useContext, useMemo, useState } from "react";

import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { AdditionalConfigurationSection } from "@app/components/assistant_builder/actions/configuration/AdditionalConfigurationSection";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/actions/configuration/AssistantBuilderDataSourceModal";
import { ChildAgentConfigurationSection } from "@app/components/assistant_builder/actions/configuration/ChildAgentConfigurationSection";
import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import DataSourceSelectionSection from "@app/components/assistant_builder/actions/configuration/DataSourceSelectionSection";
import { DustAppConfigurationSection } from "@app/components/assistant_builder/actions/configuration/DustAppConfigurationSection";
import { JsonSchemaConfigurationSection } from "@app/components/assistant_builder/actions/configuration/JsonSchemaConfigurationSection";
import { ReasoningModelConfigurationSection } from "@app/components/assistant_builder/actions/configuration/ReasoningModelConfigurationSection";
import { TimeFrameConfigurationSection } from "@app/components/assistant_builder/actions/configuration/TimeFrameConfigurationSection";
import { DataDescription } from "@app/components/assistant_builder/actions/DataDescription";
import { generateSchema } from "@app/components/assistant_builder/actions/ProcessAction";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderActionState,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { getServerTypeAndIdFromSId } from "@app/lib/actions/mcp_helper";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type { LightWorkspaceType, SpaceType, TimeFrame } from "@app/types";
import { asDisplayName, assertNever } from "@app/types";

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
  action: AssistantBuilderActionState;
  isEditing: boolean;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderActionConfiguration["configuration"]
    ) => AssistantBuilderActionConfiguration["configuration"];
  }) => void;
  setEdited: (edited: boolean) => void;
  setShowInvalidActionDescError: (
    showInvalidActionDescError: string | null
  ) => void;
  showInvalidActionDescError: string | null;
}

// To have consistent layout, if you want to add a new section here,
// please use the `ConfigurationSectionContainer` component and wrap the section in it.
export function MCPAction({
  owner,
  allowedSpaces,
  action,
  updateAction,
  setEdited,
  setShowInvalidActionDescError,
  showInvalidActionDescError,
}: MCPActionProps) {
  const actionConfiguration =
    action.configuration as AssistantBuilderMCPServerConfiguration;

  const { mcpServerViews } = useContext(AssistantBuilderContext);

  const noMCPServerView = mcpServerViews.length === 0;

  const selectedMCPServerView = mcpServerViews.find(
    (mcpServerView) => mcpServerView.sId === actionConfiguration.mcpServerViewId
  );

  // MCPServerView on default MCP server will not allow switching to another one.
  const selectedServerAvailability: MCPServerAvailability | null = useMemo(
    () => selectedMCPServerView?.server.availability ?? null,
    [selectedMCPServerView]
  );

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [showTablesModal, setShowTablesModal] = useState(false);

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
  const withDataSource =
    requirements.requiresDataSourceConfiguration ||
    requirements.requiresTableConfiguration;

  // We don't show the "Available Tools" section if there is only one tool.
  // Because it's redundant with the tool description.
  const hasOnlyOneTool = selectedMCPServerView?.server.tools.length === 1;

  const spaceName = allowedSpaces.find(
    (space) => space.sId === selectedMCPServerView?.spaceId
  )?.name;

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

      {selectedServerAvailability === "manual" && spaceName && (
        <div className="text-sm text-foreground dark:text-foreground-night">
          Available to you via <b>{spaceName}</b> space.
        </div>
      )}

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
      {requirements.requiredDustAppConfiguration && (
        <DustAppConfigurationSection
          owner={owner}
          allowedSpaces={allowedSpaces}
          selectedConfig={actionConfiguration.dustAppConfiguration}
          onConfigSelect={(dustAppConfig) => {
            handleConfigUpdate((old) => ({
              ...old,
              dustAppConfiguration: dustAppConfig,
            }));
          }}
        />
      )}
      {requirements.mayRequireTimeFrameConfiguration && (
        <TimeFrameConfigurationSection
          onConfigUpdate={(timeFrame: TimeFrame | null) => {
            handleConfigUpdate((old) => ({ ...old, timeFrame }));
          }}
          timeFrame={actionConfiguration.timeFrame}
        />
      )}
      {requirements.mayRequireJsonSchemaConfiguration && (
        <JsonSchemaConfigurationSection
          instructions={action.description}
          description={action.description}
          sectionConfigurationDescription="Optionally, provide a schema for the data to be extracted. If you do not specify a schema, the tool will determine the schema based on the conversation context."
          setEdited={setEdited}
          onConfigUpdate={({ jsonSchema, _jsonSchemaString }) => {
            handleConfigUpdate((old) => ({
              ...old,
              _jsonSchemaString,
              jsonSchema:
                // only update jsonSchema if it's set (to a valid schema or to null)
                jsonSchema === undefined ? old.jsonSchema : jsonSchema,
            }));
          }}
          initialSchema={
            actionConfiguration._jsonSchemaString ??
            (actionConfiguration.jsonSchema
              ? JSON.stringify(actionConfiguration.jsonSchema, null, 2)
              : null)
          }
          generateSchema={(instructions: string) =>
            generateSchema({ owner, instructions })
          }
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
      {withDataSource && (
        <DataDescription
          updateAction={updateAction}
          action={action}
          setShowInvalidActionDescError={setShowInvalidActionDescError}
          showInvalidActionDescError={showInvalidActionDescError}
        />
      )}

      {selectedMCPServerView && !hasOnlyOneTool && (
        <ConfigurationSectionContainer title="Available Tools">
          <ToolsList
            owner={owner}
            tools={selectedMCPServerView.server.tools}
            serverType={
              getServerTypeAndIdFromSId(selectedMCPServerView.server.sId)
                .serverType
            }
            serverId={selectedMCPServerView.server.sId}
            canUpdate={false}
          />
        </ConfigurationSectionContainer>
      )}
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
        mcpServerView.sId === action.configuration.mcpServerViewId
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
      return "Please select an agent.";
    }
    if (
      requirements.requiresReasoningConfiguration &&
      !action.configuration.reasoningModel
    ) {
      return "Please select a reasoning model.";
    }
    if (
      requirements.requiredDustAppConfiguration &&
      !action.configuration.dustAppConfiguration
    ) {
      return "Please select a Dust App.";
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
