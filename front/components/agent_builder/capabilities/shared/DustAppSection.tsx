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
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useController } from "react-hook-form";

import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import { useApps } from "@app/lib/swr/apps";
import type {
  AppType,
  DustAppRunConfigurationType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";

interface AppTableData extends AppType {
  onClick?: () => void;
}

interface DustAppSectionProps {
  owner: LightWorkspaceType;
  allowedSpaces: SpaceType[];
}

export function DustAppSection({ owner, allowedSpaces }: DustAppSectionProps) {
  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.dustAppConfiguration"
  >({
    name: "configuration.dustAppConfiguration",
  });

  const [selectedSpace, setSelectedSpace] = useState<SpaceType | null>(
    allowedSpaces[0] || null
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchQuery, setSearchQuery] = useState("");

  const { apps, isAppsLoading } = useApps({
    owner,
    space: selectedSpace || allowedSpaces[0],
    disabled: !selectedSpace,
  });

  const availableApps = useMemo(
    () =>
      sortBy(
        apps.filter((app) => app.description && app.description.length > 0),
        "name"
      ),
    [apps]
  );

  useEffect(() => {
    if (field.value && availableApps.length > 0) {
      const selectedIndex = availableApps.findIndex(
        (app) => app.sId === field.value.appId
      );
      if (selectedIndex >= 0) {
        setRowSelection({ [selectedIndex]: true });
      } else {
        setRowSelection({});
      }
    } else {
      setRowSelection({});
    }
  }, [field.value, availableApps]);

  const handleRowSelectionChange = useCallback(
    (newSelection: RowSelectionState) => {
      setRowSelection(newSelection);
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
    },
    [availableApps, field, owner.sId]
  );

  const tableData: AppTableData[] = useMemo(
    () => availableApps.map((app) => ({ ...app })),
    [availableApps]
  );

  const columns: ColumnDef<AppTableData>[] = useMemo(
    () => [
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
    ],
    []
  );

  const renderContent = () => {
    if (isAppsLoading) {
      return (
        <div className="flex h-full w-full items-center justify-center">
          <Spinner />
        </div>
      );
    }

    if (allowedSpaces.length > 0 && selectedSpace && availableApps.length > 0) {
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

    let messageProps: {
      title: string;
      children: string;
    };

    if (allowedSpaces.length === 0) {
      messageProps = {
        title: "No spaces available",
        children: "You need access to at least one space to select Dust apps.",
      };
    } else if (!selectedSpace) {
      messageProps = {
        title: "Select a space",
        children: "Please select a space to view available Dust apps.",
      };
    } else {
      messageProps = {
        title: "No Dust apps available",
        children:
          apps.length > 0
            ? "Dust apps without a description are not selectable. To make a Dust App selectable, edit it and add a description."
            : "No Dust apps found in this space. Create a Dust app first.",
      };
    }

    return (
      <ContentMessage
        title={messageProps.title}
        icon={InformationCircleIcon}
        variant="warning"
        size="sm"
      >
        {messageProps.children}
      </ContentMessage>
    );
  };

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
                  onClick={() => {
                    setSelectedSpace(space);
                    setRowSelection({});
                    field.onChange(null);
                  }}
                >
                  {space.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {renderContent()}
      </div>
    </ConfigurationSectionContainer>
  );
}
