import {
  Button,
  Card,
  CommandLineIcon,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { PencilIcon } from "@heroicons/react/20/solid";
import type { ColumnDef } from "@tanstack/react-table";
import sortBy from "lodash/sortBy";
import React, { useEffect, useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useApps } from "@app/lib/swr/apps";
import type {
  AppType,
  DustAppRunConfigurationType,
  SpaceType,
} from "@app/types";

interface AppTableData extends AppType {
  onClick: () => void;
}

interface AppSelectionTableProps {
  tableData: AppTableData[];
  columns: ColumnDef<AppTableData>[];
}

function AppSelectionTable({ tableData, columns }: AppSelectionTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        name="search"
        placeholder="Search"
        value={searchQuery}
        onChange={setSearchQuery}
      />
      <DataTable
        data={tableData}
        columns={columns}
        getRowId={(row, index) => index.toString()}
        filter={searchQuery}
        filterColumn="name"
      />
    </div>
  );
}

export function DustAppSection(
  { dustAppConfiguration }: {
    dustAppConfiguration?: {
      description?: string;
      default?: { appId: string };
    };
  }
) {
  const { owner } = useAgentBuilderContext();
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.dustAppConfiguration"
  >({
    name: "configuration.dustAppConfiguration",
  });

  const { spaces } = useSpacesContext();

  const [selectedSpace, setSelectedSpace] = useState<SpaceType>(
    () => spaces[0]
  );

  const { apps, isAppsLoading } = useApps({
    owner,
    space: selectedSpace,
  });

  useEffect(() => {
    const configuredAppId = field.value?.appId ?? dustAppConfiguration?.default?.appId;

    console.log("configuredAppId", configuredAppId);
    if (!configuredAppId || isAppsLoading) {
      return;
    }

    const appInCurrentSpace = apps.find((app) => app.sId === configuredAppId);
    if (!appInCurrentSpace && selectedSpace) {
      const currentIndex = spaces.findIndex(
        (space) => space.sId === selectedSpace.sId
      );
      const nextSpace = spaces[currentIndex + 1];
      if (nextSpace) {
        setSelectedSpace(nextSpace);
      }
    }
  }, [field.value?.appId, dustAppConfiguration?.default?.appId, apps, isAppsLoading, selectedSpace, spaces]);

  const availableApps = useMemo(
    () =>
      sortBy(
        apps.filter((app) => app.description && app.description.length > 0),
        "name"
      ),
    [apps]
  );

  const handleRowClick = (app: AppType) => {
    const config: DustAppRunConfigurationType = {
      id: app.id,
      sId: app.sId,
      appId: app.sId,
      appWorkspaceId: owner.sId,
      name: app.name,
      description: app.description,
      type: "dust_app_run_configuration",
    };
    console.log("config", config);
    field.onChange(config);
  };

  const handleEditClick = () => {
    field.onChange(null);
  };

  const handleSpaceChange = (space: SpaceType) => {
    setSelectedSpace(space);
    field.onChange(null); // Clear selection when changing space
  };

  const tableData: AppTableData[] = availableApps.map((app) => ({
    ...app,
    onClick: () => handleRowClick(app),
  }));

  const columns: ColumnDef<AppTableData>[] = [
    {
      id: "name",
      accessorKey: "name",
      cell: ({ row }) => (
        <DataTable.CellContent icon={CommandLineIcon}>
          <div className="flex flex-col">
            <div className="heading-sm truncate">{row.original.name}</div>
            <div className="truncate text-xs text-muted-foreground dark:text-muted-foreground-night">
              {/* eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing */}
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
      <div className="flex h-full flex-col gap-3">
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
              {spaces.map((space) => (
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
        ) : field.value ? (
          <Card size="sm" className="w-full">
            <div className="flex w-full">
              <div className="flex w-full flex-grow flex-col gap-1 overflow-hidden">
                <div className="flex items-center gap-2">
                  <CommandLineIcon className="h-6 w-6 text-muted-foreground" />
                  <div className="text-md font-medium">{field.value.name}</div>
                </div>
                <div className="max-h-24 overflow-y-auto text-sm text-muted-foreground dark:text-muted-foreground-night">
                  {field.value.description || "No description available"}
                </div>
              </div>
              <div className="ml-4 self-start">
                <Button
                  variant="outline"
                  size="sm"
                  icon={PencilIcon}
                  label="Edit selection"
                  onClick={handleEditClick}
                />
              </div>
            </div>
          </Card>
        ) : spaces.length > 0 && selectedSpace && availableApps.length > 0 ? (
          <AppSelectionTable tableData={tableData} columns={columns} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="px-4 text-center">
              <div className="mb-2 text-lg font-medium text-foreground">
                No Dust Apps available for this space
              </div>
              <div className="max-w-sm text-muted-foreground">
                Create one or ask your admin to install apps from other spaces.
              </div>
            </div>
          </div>
        )}
      </div>
    </ConfigurationSectionContainer>
  );
}
