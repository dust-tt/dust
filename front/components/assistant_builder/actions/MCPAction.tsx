import { ContentMessage, InformationCircleIcon } from "@dust-tt/sparkle";
import { useCallback, useMemo, useState } from "react";

import { ToolsList } from "@app/components/actions/mcp/ToolsList";
import { AdditionalConfigurationSection } from "@app/components/assistant_builder/actions/configuration/AdditionalConfigurationSection";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/actions/configuration/AssistantBuilderDataSourceModal";
import { ChildAgentConfigurationSection } from "@app/components/assistant_builder/actions/configuration/ChildAgentConfigurationSection";
import { ConfigurationSectionContainer } from "@app/components/assistant_builder/actions/configuration/ConfigurationSectionContainer";
import { CustomToggleSection } from "@app/components/assistant_builder/actions/configuration/CustomToggleSection";
import DataSourceSelectionSection from "@app/components/assistant_builder/actions/configuration/DataSourceSelectionSection";
import { DustAppConfigurationSection } from "@app/components/assistant_builder/actions/configuration/DustAppConfigurationSection";
import { JsonSchemaConfigurationSection } from "@app/components/assistant_builder/actions/configuration/JsonSchemaConfigurationSection";
import { ReasoningModelConfigurationSection } from "@app/components/assistant_builder/actions/configuration/ReasoningModelConfigurationSection";
import { TimeFrameConfigurationSection } from "@app/components/assistant_builder/actions/configuration/TimeFrameConfigurationSection";
import { DataDescription } from "@app/components/assistant_builder/actions/DataDescription";
import { useMCPServerViewsContext } from "@app/components/assistant_builder/contexts/MCPServerViewsContext";
import type {
  AssistantBuilderMCPConfiguration,
  AssistantBuilderMCPOrVizState,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import type { MCPServerAvailability } from "@app/lib/actions/mcp_internal_actions/constants";
import { ADVANCED_SEARCH_SWITCH } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { validateConfiguredJsonSchema } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import { isDustAppRunConfiguration } from "@app/lib/actions/types/guards";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import type {
  LightWorkspaceType,
  Result,
  SpaceType,
  TimeFrame,
  WhitelistableFeature,
  WorkspaceType,
} from "@app/types";
import { asDisplayName, assertNever, Err, Ok } from "@app/types";

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
  hasFeature: (feature: WhitelistableFeature | null | undefined) => boolean;
  action: AssistantBuilderMCPOrVizState;
  isEditing: boolean;
  updateAction: (args: {
    actionName: string;
    actionDescription: string;
    getNewActionConfig: (
      old: AssistantBuilderMCPConfiguration["configuration"]
    ) => AssistantBuilderMCPConfiguration["configuration"];
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
  hasFeature,
  action,
  updateAction,
  setEdited,
  setShowInvalidActionDescError,
  showInvalidActionDescError,
}: MCPActionProps) {
  const actionConfiguration =
    action.configuration as AssistantBuilderMCPServerConfiguration;

  const { mcpServerViews } = useMCPServerViewsContext();

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

      let actionName: string = action.name;
      if (
        action.type === "MCP" &&
        isDustAppRunConfiguration(action.configuration.dustAppConfiguration)
      ) {
        const { dustAppConfiguration } = action.configuration;
        actionName = dustAppConfiguration?.name;
      }

      updateAction({
        actionName,
        actionDescription: action.description,
        getNewActionConfig: (old) =>
          getNewConfig(old as AssistantBuilderMCPServerConfiguration),
      });
    },
    [
      action.configuration,
      action.description,
      action.name,
      action.type,
      setEdited,
      updateAction,
    ]
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
      {requirements.requiresDustAppConfiguration && (
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
            mcpServerView={selectedMCPServerView}
            forcedCanUpdate={false}
          />
        </ConfigurationSectionContainer>
      )}

      {/* Add a custom toggle for the search server that enables the advanced search mode. */}
      {hasFeature("advanced_search") && (
        <CustomToggleSection
          title="Advanced Search Mode"
          description="Enable advanced search capabilities with enhanced discovery and filtering options for more precise results."
          targetMCPServerName="search"
          selectedMCPServerView={selectedMCPServerView}
          configurationKey={ADVANCED_SEARCH_SWITCH}
          actionConfiguration={actionConfiguration}
          handleConfigUpdate={handleConfigUpdate}
        />
      )}
    </>
  );
}

export function hasErrorActionMCP(
  action: AssistantBuilderMCPConfiguration,
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
      requirements.requiresDustAppConfiguration &&
      !action.configuration.dustAppConfiguration
    ) {
      return "Please select a Dust App.";
    }
    if (
      requirements.mayRequireJsonSchemaConfiguration &&
      action.configuration._jsonSchemaString
    ) {
      const validationResult = validateConfiguredJsonSchema(
        action.configuration._jsonSchemaString
      );
      if (validationResult.isErr()) {
        return validationResult.error.message;
      }
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

export async function generateSchema({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}): Promise<Result<Record<string, unknown>, Error>> {
  const res = await fetch(
    `/api/w/${owner.sId}/assistant/builder/process/generate_schema`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        instructions,
      }),
    }
  );
  if (!res.ok) {
    return new Err(new Error("Failed to generate schema"));
  }
  return new Ok((await res.json()).schema || null);
}
