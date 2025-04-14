import {
  Avatar,
  Card,
  ContentMessage,
  InformationCircleIcon,
  Label,
  RadioGroup,
  RadioGroupCustomItem,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import { sortBy } from "lodash";
import React, { useCallback, useContext, useMemo, useState } from "react";

import { AdditionalConfigurationSection } from "@app/components/assistant_builder/actions/configuration/AdditionalConfigurationSection";
import { ChildAgentSelector } from "@app/components/assistant_builder/actions/configuration/ChildAgentSelector";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { getVisual } from "@app/lib/actions/mcp_icons";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { asDisplayName, assertNever, slugify } from "@app/types";

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

  // MCPServerView on default MCP server will not allow switching to another one.
  const isDefaultMCPServer = useMemo(
    () => !!selectedMCPServerView?.server.isDefault,
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
                          Visit the "Actions" section in the Admins panel to add
                          an Action.
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
        ) : (
          <>
            {isDefaultMCPServer ? (
              <div className="text-element-700 text-sm">
                {selectedMCPServerView?.server.description}
              </div>
            ) : (
              <>
                <div className="text-element-700 text-sm">
                  The agent will execute an{" "}
                  <a
                    className="font-bold"
                    href="https://docs.dust.tt"
                    target="_blank"
                  >
                    Action
                  </a>{" "}
                  made available to you.
                </div>
                {isSpacesLoading ? (
                  <Spinner />
                ) : (
                  <SpaceSelector
                    spaces={filteredSpaces}
                    allowedSpaces={allowedSpaces}
                    defaultSpace={
                      selectedMCPServerView
                        ? selectedMCPServerView.spaceId
                        : allowedSpaces[0].sId
                    }
                    renderChildren={(space) => {
                      const mcpServerViewsInSpace = space
                        ? mcpServerViews.filter(
                            (mcpServerView) =>
                              mcpServerView.spaceId === space.sId
                          )
                        : mcpServerViews;
                      if (
                        mcpServerViewsInSpace.length === 0 ||
                        hasNoMCPServerViewsInAllowedSpaces
                      ) {
                        return <>No Actions available.</>;
                      }

                      return (
                        <RadioGroup defaultValue={selectedMCPServerView?.id}>
                          {sortBy(mcpServerViewsInSpace, "server.name")
                            // Default servers can be added as capabilities or in the first level of the Add actions list
                            .filter((view) => !view.server.isDefault)
                            .map((mcpServerView, idx, arr) => {
                              return (
                                <React.Fragment key={mcpServerView.id}>
                                  <RadioGroupCustomItem
                                    value={mcpServerView.id}
                                    id={mcpServerView.id}
                                    iconPosition="start"
                                    customItem={
                                      <Label
                                        htmlFor={mcpServerView.id}
                                        className="font-normal"
                                      >
                                        <Card
                                          variant="tertiary"
                                          size="sm"
                                          onClick={() => {
                                            handleServerSelection(
                                              mcpServerView
                                            );
                                          }}
                                        >
                                          <div className="flex flex-row items-center gap-2">
                                            <div>
                                              <Avatar
                                                visual={getVisual(
                                                  mcpServerView.server
                                                )}
                                              />
                                            </div>
                                            <div className="flex flex-grow items-center justify-between overflow-hidden truncate">
                                              <div className="flex flex-col gap-1">
                                                <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                                                  {asDisplayName(
                                                    mcpServerView.server.name
                                                  )}
                                                </div>
                                                <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                                                  {
                                                    mcpServerView.server
                                                      .description
                                                  }
                                                </div>
                                              </div>
                                            </div>
                                          </div>
                                        </Card>
                                      </Label>
                                    }
                                    onClick={() => {
                                      handleServerSelection(mcpServerView);
                                    }}
                                  ></RadioGroupCustomItem>
                                  {idx !== arr.length - 1 && <Separator />}
                                </React.Fragment>
                              );
                            })}
                        </RadioGroup>
                      );
                    }}
                  />
                )}
              </>
            )}
          </>
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
