import { ContentMessage, InformationCircleIcon } from "@dust-tt/sparkle";
import React, { useCallback, useContext, useMemo, useState } from "react";

import { AdditionalConfigurationSection } from "@app/components/assistant_builder/actions/configuration/AdditionalConfigurationSection";
import { ChildAgentSelector } from "@app/components/assistant_builder/actions/configuration/ChildAgentSelector";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { MCPServerSelector } from "@app/components/assistant_builder/MCPServerSelector";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { assertNever, slugify } from "@app/types";

interface NoActionAvailableProps {
  owner: LightWorkspaceType;
}

function NoActionAvailable({ owner }: NoActionAvailableProps) {
  return (
    <ContentMessage
      title="You don't have any Actions available"
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
                    Visit the "Actions" section in the Admins panel to add an
                    Action.
                  </strong>
                </div>
              );
            case "builder":
            case "user":
              return (
                <div>
                  <strong>Ask your Admins to add an Action.</strong>
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
  updateAction,
  setEdited,
}: MCPActionProps) {
  const actionConfiguration =
    action.configuration as AssistantBuilderMCPServerConfiguration;

  const { mcpServerViews } = useContext(AssistantBuilderContext);
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
  const filteredSpaces = useMemo(
    () =>
      spaces.filter((space) =>
        mcpServerViews.some(
          (mcpServerView) => mcpServerView.spaceId === space.sId
        )
      ),
    [spaces, mcpServerViews]
  );

  const noMCPServerView = mcpServerViews.length === 0;

  const hasNoMCPServerViewsInAllowedSpaces = useMemo(() => {
    // No n^2 complexity.
    const allowedSet = new Set(allowedSpaces.map((space) => space.sId));
    return mcpServerViews.every(
      (mcpServerView) => !allowedSet.has(mcpServerView.spaceId)
    );
  }, [mcpServerViews, allowedSpaces]);

  const [selectedMCPServerView, setSelectedMCPServerView] =
    useState<MCPServerViewType | null>(
      mcpServerViews.find(
        (mcpServerView) =>
          mcpServerView.id === actionConfiguration.mcpServerViewId
      ) ?? null
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
          // We initialize with the default values for required booleans since these can be left unset.
          additionalConfiguration: requirements.requiredBooleans,
        }),
      });
    },
    [setEdited, updateAction]
  );

  const handleDataSourceConfigUpdate = useCallback(
    (dsConfigs: DataSourceViewSelectionConfigurations) => {
      setEdited(true);
      updateAction({
        actionName: action.name,
        actionDescription: action.description,
        getNewActionConfig: (old) => ({
          ...(old as AssistantBuilderMCPServerConfiguration),
          dataSourceConfigurations: dsConfigs,
        }),
      });
    },
    [action.description, action.name, setEdited, updateAction]
  );

  const handleTableConfigUpdate = useCallback(
    (tableConfigs: DataSourceViewSelectionConfigurations) => {
      setEdited(true);

      updateAction({
        actionName: action.name,
        actionDescription: action.description,
        getNewActionConfig: (old) => ({
          ...(old as AssistantBuilderMCPServerConfiguration),
          tablesConfigurations: tableConfigs,
        }),
      });
    },
    [action.description, action.name, setEdited, updateAction]
  );

  const handleChildAgentConfigUpdate = useCallback(
    (newChildAgentId: string) => {
      setEdited(true);

      updateAction({
        actionName: action.name,
        actionDescription: action.description,
        getNewActionConfig: (old) => ({
          ...(old as AssistantBuilderMCPServerConfiguration),
          childAgentId: newChildAgentId,
        }),
      });
    },
    [action.description, action.name, setEdited, updateAction]
  );

  const handleAdditionalConfigUpdate = useCallback(
    (key: string, value: string | number | boolean) => {
      if (!selectedMCPServerView) {
        return;
      }
      setEdited(true);
      updateAction({
        actionName: slugify(selectedMCPServerView?.server.name ?? ""),
        actionDescription: selectedMCPServerView?.server.description ?? "",
        getNewActionConfig: (prev) => {
          const prevConfig = prev as AssistantBuilderMCPServerConfiguration;
          return {
            ...prevConfig,
            mcpServerViewId: selectedMCPServerView.id,
            additionalConfiguration: {
              ...prevConfig.additionalConfiguration,
              [key]: value,
            },
          };
        },
      });
    },
    [selectedMCPServerView, setEdited, updateAction]
  );

  if (action.type !== "MCP") {
    return null;
  }

  const requirements = getMCPServerRequirements(selectedMCPServerView);

  return (
    <>
      {requirements.requiresDataSourceConfiguration && (
        <AssistantBuilderDataSourceModal
          isOpen={showDataSourcesModal}
          setOpen={setShowDataSourcesModal}
          owner={owner}
          onSave={handleDataSourceConfigUpdate}
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
          onSave={handleTableConfigUpdate}
          initialDataSourceConfigurations={
            actionConfiguration.tablesConfigurations ?? {}
          }
          allowedSpaces={allowedSpaces}
          viewType="table"
        />
      )}
      <>
        {noMCPServerView ? (
          <NoActionAvailable owner={owner} />
        ) : (
          <MCPServerSelector
            isSpacesLoading={isSpacesLoading}
            filteredSpaces={filteredSpaces}
            allowedSpaces={allowedSpaces}
            mcpServerViews={mcpServerViews}
            selectedMCPServerView={selectedMCPServerView}
            hasNoMCPServerViewsInAllowedSpaces={
              hasNoMCPServerViewsInAllowedSpaces
            }
            handleServerSelection={handleServerSelection}
          />
        )}
      </>
      {requirements.requiresDataSourceConfiguration && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={
            actionConfiguration.dataSourceConfigurations ?? {}
          }
          openDataSourceModal={() => setShowDataSourcesModal(true)}
          onSave={handleDataSourceConfigUpdate}
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
          onSave={handleTableConfigUpdate}
          viewType="table"
        />
      )}
      {requirements.requiresChildAgentConfiguration && (
        <ChildAgentSelector
          onAgentSelect={handleChildAgentConfigUpdate}
          selectedAgentId={actionConfiguration.childAgentId}
          owner={owner}
        />
      )}
      <AdditionalConfigurationSection
        requiredStrings={requirements.requiredStrings}
        requiredNumbers={requirements.requiredNumbers}
        requiredBooleans={requirements.requiredBooleans}
        additionalConfiguration={actionConfiguration.additionalConfiguration}
        onConfigUpdate={handleAdditionalConfigUpdate}
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
      return "Please select data source(s).";
    }
    if (
      requirements.requiresTableConfiguration &&
      !action.configuration.tablesConfigurations
    ) {
      return "Please select table(s).";
    }
    if (
      requirements.requiresChildAgentConfiguration &&
      !action.configuration.childAgentId
    ) {
      return "Please select a child agent.";
    }
    for (const key in requirements.requiredStrings) {
      if (!(key in action.configuration.additionalConfiguration)) {
        return `Please fill in all fields.`;
      }
    }
    for (const key in requirements.requiredNumbers) {
      if (!(key in action.configuration.additionalConfiguration)) {
        return `Please fill in all required numeric fields.`;
      }
    }

    return null;
  }
  return "Please select a tool.";
}
