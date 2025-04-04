import { INTERNAL_MIME_TYPES } from "@dust-tt/client";
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

import { AssistantBuilderContext } from "@app/components/assistant_builder/AssistantBuilderContext";
import AssistantBuilderDataSourceModal from "@app/components/assistant_builder/AssistantBuilderDataSourceModal";
import DataSourceSelectionSection from "@app/components/assistant_builder/DataSourceSelectionSection";
import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import type {
  AssistantBuilderActionConfiguration,
  AssistantBuilderMCPServerConfiguration,
} from "@app/components/assistant_builder/types";
import { MCP_SERVER_ICONS } from "@app/lib/actions/mcp_icons";
import { serverRequiresInternalConfiguration } from "@app/lib/actions/mcp_internal_actions/input_schemas";
import type { MCPServerViewType } from "@app/lib/resources/mcp_server_view_resource";
import { useSpaces } from "@app/lib/swr/spaces";
import type {
  DataSourceViewSelectionConfigurations,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { assertNever, slugify } from "@app/types";

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
  const [showDataSourcesModal, setShowDataSourcesModal] = useState(false);

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
          dataSourceConfigurations:
            selectedMCPServerView &&
            serverRequiresInternalConfiguration({
              serverMetadata: selectedMCPServerView.server,
              mimeType: INTERNAL_MIME_TYPES.CONFIGURATION.DATA_SOURCE,
            })
              ? prevConfig.dataSourceConfigurations || {}
              : null,
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
        getNewActionConfig: (prev) => {
          const prevConfig = prev as AssistantBuilderMCPServerConfiguration;

          return {
            ...prevConfig,
            mcpServerViewId: serverView.id,
          };
        },
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
        getNewActionConfig: (prev) => {
          const prevConfig = prev as AssistantBuilderMCPServerConfiguration;

          return {
            ...prevConfig,
            mcpServerViewId: selectedMCPServerView.id,
            dataSourceConfigurations: dsConfigs,
          };
        },
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
            <div className="text-sm text-element-700">
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
                                <div className="ml-10 mt-1 text-sm text-element-700 dark:text-element-700-night">
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
      {actionConfiguration.dataSourceConfigurations && (
        <DataSourceSelectionSection
          owner={owner}
          dataSourceConfigurations={
            actionConfiguration.dataSourceConfigurations
          }
          openDataSourceModal={() => setShowDataSourcesModal(true)}
          onSave={handleDataSourceConfigUpdate}
          viewType="document"
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
