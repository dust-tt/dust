import {
  CommandLineIcon,
  ContentMessage,
  createRadioSelectionColumn,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  InformationCircleIcon,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { Button } from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { sortBy } from "lodash";
import React, { useEffect, useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { useApps } from "@app/lib/swr/apps";
import type {
  AppType,
  DustAppRunConfigurationType,
  SpaceType,
} from "@app/types";

interface AppTableData extends AppType {
  onClick?: () => void;
}

interface AppSelectionTableProps {
  tableData: AppTableData[];
  columns: ColumnDef<AppTableData>[];
  rowSelection: RowSelectionState;
  handleRowSelectionChange: (newSelection: RowSelectionState) => void;
}

function AppSelectionTable({
  tableData,
  columns,
  rowSelection,
  handleRowSelectionChange,
}: AppSelectionTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <div className="flex flex-col">
      <SearchInput
        name="search"
        placeholder="Search"
        value={searchQuery}
        onChange={setSearchQuery}
      />
      <DataTable
        data={tableData}
        columns={columns}
        enableRowSelection
        enableMultiRowSelection={false}
        rowSelection={rowSelection}
        setRowSelection={handleRowSelectionChange}
        getRowId={(row, index) => index.toString()}
        filter={searchQuery}
        filterColumn="name"
      />
    </div>
  );
}

interface AppMessageProps {
  title: string;
  children: string;
}

function AppMessage({ title, children }: AppMessageProps) {
  return (
    <ContentMessage
      title={title}
      icon={InformationCircleIcon}
      variant="warning"
      size="sm"
    >
      {children}
    </ContentMessage>
  );
}

interface DustAppSectionProps {
  allowedSpaces: SpaceType[];
}

export function DustAppSection({ allowedSpaces }: DustAppSectionProps) {
  const { owner } = useAgentBuilderContext();
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.dustAppConfiguration"
  >({
    name: "configuration.dustAppConfiguration",
  });

  const [selectedSpace, setSelectedSpace] = useState<SpaceType>(
    () => allowedSpaces[0]
  );

  const { apps, isAppsLoading } = useApps({
    owner,
    space: selectedSpace,
  });

  useEffect(() => {
    const configuredAppId = field.value?.appId;
    if (!configuredAppId || isAppsLoading) {
      return;
    }

    const appInCurrentSpace = apps.find((app) => app.sId === configuredAppId);
    if (!appInCurrentSpace && selectedSpace) {
      const currentIndex = allowedSpaces.findIndex(
        (space) => space.sId === selectedSpace.sId
      );
      const nextSpace = allowedSpaces[currentIndex + 1];
      if (nextSpace) {
        setSelectedSpace(nextSpace);
      }
    }
  }, [field.value?.appId, apps, isAppsLoading, selectedSpace, allowedSpaces]);

  const availableApps = useMemo(
    () =>
      sortBy(
        apps.filter((app) => app.description && app.description.length > 0),
        "name"
      ),
    [apps]
  );

  const rowSelection: RowSelectionState = field.value?.appId
    ? (() => {
        const selectedIndex = availableApps.findIndex(
          (app) => app.sId === field.value.appId
        );
        return selectedIndex >= 0 ? { [selectedIndex]: true } : {};
      })()
    : {};

  const handleRowSelectionChange = (newSelection: RowSelectionState) => {
    const selectedIndex = Object.keys(newSelection)[0];
    const selectedApp = availableApps[parseInt(selectedIndex, 10)];
    if (selectedApp) {
      const config: DustAppRunConfigurationType = {
        id: selectedApp.id,
        sId: selectedApp.sId,
        appId: selectedApp.sId,
        appWorkspaceId: owner.sId,
        name: selectedApp.name,
        description: selectedApp.description,
        type: "dust_app_run_configuration",
      };
      field.onChange(config);
    }
  };

  const handleSpaceChange = (space: SpaceType) => {
    setSelectedSpace(space);
    field.onChange(null); // Clear selection when changing space
  };

  const tableData: AppTableData[] = availableApps.map((app) => ({ ...app }));

  const columns: ColumnDef<AppTableData>[] = [
    createRadioSelectionColumn<AppTableData>(),
    {
      id: "name",
      accessorKey: "name",
      header: () => null,
      cell: ({ row }) => (
        <DataTable.CellContent icon={CommandLineIcon}>
          <div className="flex flex-col gap-1">
            <div className="text-sm font-medium">{row.original.name}</div>
            <div className="line-clamp-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
              {row.original.description || "No description available"}
            </div>
          </div>
        </DataTable.CellContent>
      ),
      meta: {
        sizeRatio: 100,
      },
    },
  ];

  return (
    <ConfigurationSectionContainer
      title="Select a Dust App"
      error={fieldState.error?.message}
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          The agent will execute a{" "}
          <a
            href="https://docs.dust.tt"
            target="_blank"
            rel="noreferrer"
            className="font-bold"
          >
            Dust Application
          </a>{" "}
          of your design before replying. The output of the app (last block) is
          injected in context for the model to generate an answer.
        </div>

        <div className="flex flex-row items-center gap-2">
          <span className="text-sm font-medium text-foreground dark:text-foreground-night">
            Space:
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="xs"
                variant="outline"
                isSelect
                label={selectedSpace ? selectedSpace.name : "Select a space..."}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full">
              {allowedSpaces.map((space) => (
                <DropdownMenuItem
                  key={space.sId}
                  onClick={() => handleSpaceChange(space)}
                >
                  {space.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {isAppsLoading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        ) : allowedSpaces.length > 0 &&
          selectedSpace &&
          availableApps.length > 0 ? (
          <AppSelectionTable
            tableData={tableData}
            columns={columns}
            rowSelection={rowSelection}
            handleRowSelectionChange={handleRowSelectionChange}
          />
        ) : (
          <AppMessage
            title={
              allowedSpaces.length === 0
                ? "No spaces available"
                : !selectedSpace
                  ? "Select a space"
                  : "No Dust apps available"
            }
          >
            {allowedSpaces.length === 0
              ? "You need access to at least one space to select Dust apps."
              : !selectedSpace
                ? "Please select a space to view available Dust apps."
                : apps.length > 0
                  ? "Dust apps without a description are not selectable. To make a Dust App selectable, edit it and add a description."
                  : "No Dust apps found in this space. Create a Dust app first."}
          </AppMessage>
        )}
      </div>
    </ConfigurationSectionContainer>
  );
}
