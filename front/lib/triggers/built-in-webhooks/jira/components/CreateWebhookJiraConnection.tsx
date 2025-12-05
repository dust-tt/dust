import {
  Button,
  Chip,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Label,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import type { WebhookCreateFormComponentProps } from "@app/components/triggers/webhook_preset_components";
import { useWebhookServiceData } from "@app/lib/swr/useWebhookServiceData";
import type { JiraProjectType } from "@app/lib/triggers/built-in-webhooks/jira/types";

export function CreateWebhookJiraConnection({
  owner,
  onDataToCreateWebhookChange,
  onReadyToSubmitChange,
  connectionId,
}: WebhookCreateFormComponentProps) {
  const [selectedProjects, setSelectedProjects] = useState<JiraProjectType[]>(
    []
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);

  const { serviceData: jiraData, isServiceDataLoading } = useWebhookServiceData(
    {
      owner,
      connectionId,
      provider: "jira",
    }
  );

  const { jiraProjects, filteredProjects } = useMemo(() => {
    const jiraProjects = jiraData?.projects ?? [];
    const filteredProjects = jiraProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        project.key.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return { jiraProjects, filteredProjects };
  }, [jiraData, searchQuery]);

  const projectsInDropdown = useMemo(
    () =>
      filteredProjects.filter(
        (project) => !selectedProjects.some((p) => p.key === project.key)
      ),
    [filteredProjects, selectedProjects]
  );

  useEffect(() => {
    const isReady = !!(connectionId && selectedProjects.length > 0);

    if (isReady && onDataToCreateWebhookChange) {
      onDataToCreateWebhookChange({
        connectionId,
        remoteMetadata: {
          projects: selectedProjects,
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
    selectedProjects,
    onDataToCreateWebhookChange,
    onReadyToSubmitChange,
  ]);

  const handleAddProject = (project: JiraProjectType) => {
    if (!selectedProjects.some((p) => p.key === project.key)) {
      setSelectedProjects([...selectedProjects, project]);
    }
    setSearchQuery("");
    setShowDropdown(false);
  };

  const handleRemoveProject = (project: JiraProjectType) => {
    setSelectedProjects(selectedProjects.filter((p) => p.key !== project.key));
  };

  return (
    <div className="flex flex-col space-y-4">
      {isServiceDataLoading ? (
        <div className="mt-2 flex items-center gap-2 py-2">
          <Spinner size="sm" />
          <span className="text-sm text-muted-foreground">
            Loading projects...
          </span>
        </div>
      ) : (
        <>
          <div>
            <Label>
              Projects{" "}
              {selectedProjects.length === 0 && (
                <span className="text-warning">*</span>
              )}
            </Label>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Select Jira projects to monitor for events
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-1">
                {selectedProjects.map((project) => (
                  <Chip
                    key={project.key}
                    size="xs"
                    label={`${project.key} - ${project.name}`}
                    color="primary"
                    className="m-0.5"
                    onRemove={() => handleRemoveProject(project)}
                  />
                ))}
              </div>
              {jiraProjects.length > 0 && (
                <div className="flex">
                  <DropdownMenu
                    open={showDropdown}
                    onOpenChange={setShowDropdown}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        label="Add project"
                        variant="outline"
                        icon={PlusIcon}
                        size="sm"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-80" align="start">
                      <DropdownMenuSearchbar
                        name="project"
                        placeholder="Search projects..."
                        value={searchQuery}
                        onChange={setSearchQuery}
                      />
                      <div className="max-h-64 overflow-y-auto">
                        {projectsInDropdown.length > 0 ? (
                          projectsInDropdown.map((project) => (
                            <DropdownMenuItem
                              key={project.key}
                              onClick={() => handleAddProject(project)}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">
                                  {project.name}
                                </span>
                                <span className="font-mono text-xs text-muted-foreground">
                                  {project.key}
                                </span>
                              </div>
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                            No projects found
                          </div>
                        )}
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>

          {selectedProjects.length === 0 && (
            <p className="dark:text-warning-night mt-1 text-xs text-warning">
              Please select at least one project to create the webhook
            </p>
          )}
        </>
      )}
    </div>
  );
}
