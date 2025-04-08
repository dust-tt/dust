import {
  classNames,
  ContentMessage,
  Icon,
  InformationCircleIcon,
  Label,
  RadioGroup,
  RadioGroupCustomItem,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import { sortBy } from "lodash";
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ChildAgentSelector } from "@app/components/assistant_builder/actions/configuration/ChildAgentSelector";
import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { MCP_SERVER_ICONS } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/actions/mcp_metadata";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { assertNever, slugify } from "@app/types";
import { useMCPServerRequiredConfiguration } from "@app/hooks/useMCPServerRequiredConfiguration";

interface ActionMCPProps {
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

export function ActionMCP({
  owner,
  allowedSpaces,
  action,
  updateAction,
  setEdited,
}: ActionMCPProps) {
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
  const {
    requiresChildAgentConfiguration,
    requiresTableConfiguration,
    requiresDataSourceConfiguration,
  } = useMCPServerRequiredConfiguration({
    mcpServerView: selectedMCPServerView,
  });

  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);
  const [showTablesModal, setShowTablesModal] = useState(false);

  useEffect(() => {
    if (!selectedMCPServerView) {
      return;
    }

    updateAction({
      actionName: slugify(selectedMCPServerView.server.name ?? ""),
      actionDescription: selectedMCPServerView.server.description ?? "",
      getNewActionConfig: (prev) => {
        const prevConfig = prev as AssistantBuilderMCPServerConfiguration;

        return {
          ...prevConfig,
          mcpServerViewId: selectedMCPServerView.id,
          // We control here the relationship between the field in AssistantBuilderMCPServerConfiguration
          // and the mimeType to look for in the server metadata.
          dataSourceConfigurations: prevConfig.dataSourceConfigurations,
          tablesConfigurations: prevConfig.tablesConfigurations,
          childAgentId: prevConfig.childAgentId,
        };
      },
    });
  }, [selectedMCPServerView, updateAction]);

  const handleServerSelection = useCallback(
    (serverView: MCPServerViewType) => {
      setEdited(true);
      setSelectedMCPServerView(serverView);

      if (!selectedMCPServerView) {
        return;
      }
      updateAction({
        actionName: slugify(selectedMCPServerView.server.name ?? ""),
        actionDescription: selectedMCPServerView.server.description ?? "",
        getNewActionConfig: (prev) => ({
          ...(prev as AssistantBuilderMCPServerConfiguration),
          mcpServerViewId: serverView.id,
        }),
      });
    },
    [selectedMCPServerView, setEdited, updateAction]
  );

  const handleDataSourceConfigUpdate = useCallback(
    (dsConfigs: DataSourceViewSelectionConfigurations) => {
      if (!selectedMCPServerView) {
        return;
      }
      setEdited(true);
      updateAction({
        actionName: slugify(selectedMCPServerView?.server.name ?? ""),
        actionDescription: selectedMCPServerView?.server.description ?? "",
        getNewActionConfig: (prev) => ({
          ...(prev as AssistantBuilderMCPServerConfiguration),
          mcpServerViewId: selectedMCPServerView.id,
          dataSourceConfigurations: dsConfigs,
        }),
      });
    },
    [selectedMCPServerView, setEdited, updateAction]
  );

  const handleTableConfigUpdate = useCallback(
    (tableConfigs: DataSourceViewSelectionConfigurations) => {
      if (!selectedMCPServerView) {
        return;
      }
      setEdited(true);
      updateAction({
        actionName: slugify(selectedMCPServerView?.server.name ?? ""),
        actionDescription: selectedMCPServerView?.server.description ?? "",
        getNewActionConfig: (prev) => ({
          ...(prev as AssistantBuilderMCPServerConfiguration),
          mcpServerViewId: selectedMCPServerView.id,
          tablesConfigurations: tableConfigs,
        }),
      });
    },
    [selectedMCPServerView, setEdited, updateAction]
  );

  const handleChildAgentConfigUpdate = useCallback(
    (childAgentSId: string) => {
      if (!selectedMCPServerView) {
        return;
      }
      setEdited(true);
      updateAction({
        actionName: slugify(selectedMCPServerView?.server.name ?? ""),
        actionDescription: selectedMCPServerView?.server.description ?? "",
        getNewActionConfig: (prev) => ({
          ...(prev as AssistantBuilderMCPServerConfiguration),
          mcpServerViewId: selectedMCPServerView.id,
          childAgentConfiguration: { sId: childAgentSId },
        }),
      });
    },
    [selectedMCPServerView, setEdited, updateAction]
  );

  if (action.type !== "MCP") {
    return null;
  }

  return (
    <>
      {actionConfiguration.dataSourceConfigurations && (
        <AssistantBuilderDataSourceModal
          isOpen={showDataSourcesModal}
          setOpen={setShowDataSourcesModal}
          owner={owner}
          onSave={handleDataSourceConfigUpdate}
          initialDataSourceConfigurations={
            actionConfiguration.dataSourceConfigurations
          }
          allowedSpaces={allowedSpaces}
          viewType="document"
        />
      )}
      {actionConfiguration.tablesConfigurations && (
        <AssistantBuilderDataSourceModal
          isOpen={showTablesModal}
          setOpen={(isOpen) => {
            setShowTablesModal(isOpen);
          }}
          owner={owner}
          onSave={handleTableConfigUpdate}
          initialDataSourceConfigurations={
            actionConfiguration.tablesConfigurations
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
                        (mcpServerView) => mcpServerView.spaceId === space.sId
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
                      {sortBy(mcpServerViewsInSpace, "server.name").map(
                        (mcpServerView, idx, arr) => {
                          return (
                            <React.Fragment key={mcpServerView.id}>
                              <RadioGroupCustomItem
                                value={mcpServerView.id}
                                id={mcpServerView.id}
                                iconPosition="start"
                                customItem={
                                  <div className="flex items-center gap-1 pl-2">
                                    <Icon
                                      visual={
                                        MCP_SERVER_ICONS[
                                          mcpServerView.server.icon
                                        ]
                                      }
                                      size="md"
                                      className={classNames(
                                        "inline-block flex-shrink-0 align-middle"
                                      )}
                                    />
                                    <Label
                                      className={classNames(
                                        "font-bold",
                                        "align-middle",
                                        "text-foreground dark:text-foreground-night"
                                      )}
                                      htmlFor={mcpServerView.id}
                                    >
                                      {mcpServerView.server.name}
                                    </Label>
                                  </div>
                                }
                                onClick={() => {
                                  handleServerSelection(mcpServerView);
                                }}
                              >
                                <div className="text-element-700 dark:text-element-700-night ml-10 mt-1 text-sm">
                                  {mcpServerView.server.description}
                                </div>
                              </RadioGroupCustomItem>
                              {idx !== arr.length - 1 && <Separator />}
                            </React.Fragment>
                          );
                        }
                      )}
                    </RadioGroup>
                  );
                }}
              />
            )}
          </>
        )}
      </>
      {requiresDataSourceConfiguration && (
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
      {requiresTableConfiguration && (
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
      {requiresChildAgentConfiguration && (
        <ChildAgentSelector
          onAgentSelect={handleChildAgentConfigUpdate}
          selectedAgentId={actionConfiguration.childAgentId}
          owner={owner}
        />
      )}
    </>
  );
}

export function hasErrorActionMCP(
  action: AssistantBuilderActionConfiguration
): string | null {
  return action.type === "MCP" ? null : "Please select a MCP configuration.";
}
