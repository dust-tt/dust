import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Label,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { useDebounce } from "@app/hooks/useDebounce";
import { useWebhookServiceData } from "@app/lib/swr/useWebhookServiceData";
import type {
  AsanaProject,
  AsanaWorkspace,
} from "@app/lib/triggers/built-in-webhooks/asana/types";

export function CreateWebhookAsanaConnection({
  owner,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
  connectionId,
}: WebhookCreateFormComponentProps) {
  const [selectedWorkspace, setSelectedWorkspace] =
    useState<AsanaWorkspace | null>(null);
  const [selectedProject, setSelectedProject] = useState<AsanaProject | null>(
    null
  );

  const {
    inputValue: workspaceSearchQuery,
    debouncedValue: debouncedWorkspaceSearchQuery,
    setValue: setWorkspaceSearchQuery,
  } = useDebounce("", { delay: 300 });

  const {
    inputValue: projectSearchQuery,
    debouncedValue: debouncedProjectSearchQuery,
    setValue: setProjectSearchQuery,
  } = useDebounce("", { delay: 300 });

  const { serviceData: asanaData, isServiceDataLoading } = useWebhookServiceData(
    {
      owner,
      connectionId,
      provider: "asana",
    }
  );

  const { workspaces, filteredWorkspaces } = useMemo(() => {
    const workspaces = asanaData?.workspaces ?? [];
    const filteredWorkspaces = workspaces.filter((workspace) =>
      workspace.name
        .toLowerCase()
        .includes(debouncedWorkspaceSearchQuery.toLowerCase())
    );
    return { workspaces, filteredWorkspaces };
  }, [asanaData, debouncedWorkspaceSearchQuery]);

  const { projects, filteredProjects } = useMemo(() => {
    const projects = selectedWorkspace
      ? (asanaData?.projectsByWorkspace[selectedWorkspace.gid] ?? [])
      : [];
    const filteredProjects = projects.filter((project) =>
      project.name
        .toLowerCase()
        .includes(debouncedProjectSearchQuery.toLowerCase())
    );
    return { projects, filteredProjects };
  }, [asanaData, selectedWorkspace, debouncedProjectSearchQuery]);

  // Auto-select workspace if there's only one
  useEffect(() => {
    if (workspaces.length === 1 && !selectedWorkspace) {
      setSelectedWorkspace(workspaces[0]);
    }
  }, [workspaces, selectedWorkspace]);

  useEffect(() => {
    const isReady = !!(connectionId && selectedWorkspace && selectedProject);

    if (isReady && onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId,
        remoteMetadata: {
          workspace: selectedWorkspace,
          project: selectedProject,
        },
      });
    } else if (onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange(null);
    }

    if (onReadyToSubmitChange) {
      onReadyToSubmitChange(isReady);
    }
  }, [
    connectionId,
    selectedWorkspace,
    selectedProject,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const handleSelectWorkspace = (workspace: AsanaWorkspace) => {
    setSelectedWorkspace(workspace);
    setSelectedProject(null); // Reset project when workspace changes
    setWorkspaceSearchQuery("");
  };

  const handleSelectProject = (project: AsanaProject) => {
    setSelectedProject(project);
    setProjectSearchQuery("");
  };

  return (
    <div className="space-y-6">
      {isServiceDataLoading ? (
        <div className="mt-2 flex items-center gap-2 py-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">
            Loading workspaces and projects...
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Workspace Selection */}
          <div>
            <Label>
              Workspace{" "}
              {!selectedWorkspace && <span className="text-warning">*</span>}
            </Label>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Select the Asana workspace
            </p>
            <div className="mt-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    label={selectedWorkspace?.name ?? "Select workspace"}
                    variant="outline"
                    size="sm"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  dropdownHeaders={
                    workspaces.length > 5 ? (
                      <DropdownMenuSearchbar
                        name="workspace"
                        placeholder="Search workspaces..."
                        value={workspaceSearchQuery}
                        onChange={setWorkspaceSearchQuery}
                      />
                    ) : undefined
                  }
                  className="w-80"
                  align="start"
                >
                  <div className="max-h-64 overflow-y-auto">
                    {filteredWorkspaces.length > 0 ? (
                      filteredWorkspaces.map((workspace) => (
                        <DropdownMenuItem
                          key={workspace.gid}
                          onClick={() => handleSelectWorkspace(workspace)}
                        >
                          {workspace.name}
                        </DropdownMenuItem>
                      ))
                    ) : (
                      <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                        No workspaces found
                      </div>
                    )}
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Project Selection */}
          {selectedWorkspace && (
            <div>
              <Label>
                Project{" "}
                {!selectedProject && <span className="text-warning">*</span>}
              </Label>
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Select the project to monitor for task events
              </p>
              <div className="mt-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      label={selectedProject?.name ?? "Select project"}
                      variant="outline"
                      size="sm"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    dropdownHeaders={
                      projects.length > 5 ? (
                        <DropdownMenuSearchbar
                          name="project"
                          placeholder="Search projects..."
                          value={projectSearchQuery}
                          onChange={setProjectSearchQuery}
                        />
                      ) : undefined
                    }
                    className="w-80"
                    align="start"
                  >
                    <div className="max-h-64 overflow-y-auto">
                      {filteredProjects.length > 0 ? (
                        filteredProjects.map((project) => (
                          <DropdownMenuItem
                            key={project.gid}
                            onClick={() => handleSelectProject(project)}
                          >
                            {project.name}
                          </DropdownMenuItem>
                        ))
                      ) : (
                        <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                          No projects found in this workspace
                        </div>
                      )}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* Validation Message */}
          {(!selectedWorkspace || !selectedProject) && (
            <p className="dark:text-warning-night mt-1 text-xs text-warning">
              {!selectedWorkspace
                ? "Please select a workspace"
                : "Please select a project to create the webhook"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
