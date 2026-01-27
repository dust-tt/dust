import type { DropdownMenu, MenuItem } from "@dust-tt/sparkle";
import {
  Button,
  Checkbox,
  ContentMessage,
  DataTable,
  InformationCircleIcon,
  SearchInput,
  Spinner,
  Tree,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import type { ProjectConfiguration } from "@app/lib/api/assistant/configuration/types";
import { useSpaces } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types";

interface ProjectTableData extends SpaceType {
  isSelected: boolean;
  onClick?: undefined;
  onDoubleClick?: () => void;
  dropdownMenuProps?: React.ComponentPropsWithoutRef<typeof DropdownMenu>;
  menuItems?: MenuItem[];
}

interface ProjectSelectionTableProps {
  tableData: ProjectTableData[];
  columns: ColumnDef<ProjectTableData>[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

function ProjectSelectionTable({
  tableData,
  columns,
  searchQuery,
  setSearchQuery,
}: ProjectSelectionTableProps) {
  return (
    <div className="flex flex-col gap-2">
      <SearchInput
        name="search"
        placeholder="Search projects"
        value={searchQuery}
        onChange={setSearchQuery}
      />
      <DataTable
        data={tableData}
        columns={columns}
        filter={searchQuery}
        filterColumn="name"
        sorting={[{ id: "name", desc: false }]}
        enableSortingRemoval={false}
      />
    </div>
  );
}

interface ProjectMessageProps {
  title: string;
  children: string;
}

function ProjectMessage({ title, children }: ProjectMessageProps) {
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

export function ProjectSection() {
  const { owner } = useAgentBuilderContext();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSelecting, setIsSelecting] = useState(false);

  const { field, fieldState } = useController<
    MCPFormData,
    "configuration.dustProject"
  >({
    name: "configuration.dustProject",
  });

  const { spaces: allProjects, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["project"],
  });

  const selectedProject = useMemo(() => {
    if (!field.value) {
      return null;
    }

    return allProjects.find(
      (project) => project.sId === field.value?.projectId
    );
  }, [field.value, allProjects]);

  const handleSelectProject = useCallback(
    (project: SpaceType) => {
      const newProject: ProjectConfiguration = {
        workspaceId: owner.sId,
        projectId: project.sId,
      };
      field.onChange(newProject);
    },
    [field, owner.sId]
  );

  const handleRemoveProject = useCallback(() => {
    field.onChange(null);
  }, [field]);

  const tableData: ProjectTableData[] = useMemo(() => {
    return allProjects.map((project) => ({
      ...project,
      isSelected: field.value?.projectId === project.sId,
    }));
  }, [allProjects, field.value]);

  const columns: ColumnDef<ProjectTableData>[] = useMemo(
    () => [
      {
        id: "select",
        cell: ({ row }) => (
          <Checkbox
            checked={row.original.isSelected}
            onCheckedChange={() => handleSelectProject(row.original)}
          />
        ),
        meta: {
          sizeRatio: 5,
        },
      },
      {
        id: "name",
        accessorKey: "name",
        cell: ({ row }) => (
          <DataTable.CellContent
            onClick={() => handleSelectProject(row.original)}
          >
            <div className="flex flex-col">
              <div className="heading-sm truncate">{row.original.name}</div>
              <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                {row.original.isRestricted ? "Restricted" : "Open"} •{" "}
                {row.original.managementMode === "manual" ? "Manual" : "Group"}{" "}
                management
              </div>
            </div>
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 95,
        },
      },
    ],
    [handleSelectProject]
  );

  if (isSpacesLoading) {
    return (
      <ConfigurationSectionContainer
        title="Select Project"
        error={fieldState.error?.message}
      >
        <div className="flex h-32 w-full items-center justify-center">
          <Spinner />
        </div>
      </ConfigurationSectionContainer>
    );
  }

  if (allProjects.length === 0) {
    return (
      <ConfigurationSectionContainer
        title="Select Project"
        error={fieldState.error?.message}
      >
        <ProjectMessage title="No projects available">
          No projects are available in your workspace. Create a project first to
          use this feature.
        </ProjectMessage>
      </ConfigurationSectionContainer>
    );
  }

  return (
    <ConfigurationSectionContainer
      title="Select Project"
      error={fieldState.error?.message}
    >
      <div className="flex h-full flex-col gap-3">
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          Select the project that the agent can access. The agent will have
          access to project metadata and context from the selected project.
        </div>

        {selectedProject && !isSelecting ? (
          <div className="space-y-4">
            <div className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">Selected project</h3>
              <Button
                label="Change selection"
                variant="outline"
                size="sm"
                onClick={() => setIsSelecting(true)}
              />
            </div>

            <div className="rounded-xl bg-muted p-2 dark:bg-muted-night">
              <Tree>
                <Tree.Item
                  key={selectedProject.sId}
                  label={selectedProject.name}
                  type="leaf"
                  actions={
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={XMarkIcon}
                      onClick={handleRemoveProject}
                      tooltip="Remove project"
                    />
                  }
                />
              </Tree>
            </div>
          </div>
        ) : (
          <ProjectSelectionTable
            tableData={tableData}
            columns={columns}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
        )}
      </div>
    </ConfigurationSectionContainer>
  );
}
