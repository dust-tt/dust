import {
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  InformationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useCallback, useMemo, useState } from "react";
import { useController } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { MCPFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { ConfigurationSectionContainer } from "@app/components/agent_builder/capabilities/shared/ConfigurationSectionContainer";
import type { ProjectConfiguration } from "@app/lib/api/assistant/configuration/types";
import { getSpaceIcon } from "@app/lib/spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";

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
  const [searchOpen, setSearchOpen] = useState(false);

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
      setSearchOpen(false);
      setSearchQuery("");
    },
    [field, owner.sId]
  );

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return allProjects;
    }

    const query = searchQuery.toLowerCase();
    return allProjects.filter(
      (project) =>
        project.name.toLowerCase().includes(query) ||
        project.description?.toLowerCase().includes(query)
    );
  }, [allProjects, searchQuery]);

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
          Choose the project that the agent can access. The agent will have
          access to project metadata and context from the selected project.
        </div>

        <div className="inline-flex">
          <DropdownMenu open={searchOpen} onOpenChange={setSearchOpen}>
            <DropdownMenuTrigger asChild>
              <Button
                label={selectedProject?.name ?? "Select project..."}
                icon={
                  selectedProject ? getSpaceIcon(selectedProject) : undefined
                }
                variant="outline"
                size="xs"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              dropdownHeaders={
                <DropdownMenuSearchbar
                  name="project-search"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={setSearchQuery}
                  autoFocus
                />
              }
            >
              {filteredProjects.length > 0 ? (
                filteredProjects.map((project) => {
                  const ProjectIcon = getSpaceIcon(project);
                  return (
                    <DropdownMenuItem
                      key={project.sId}
                      onClick={() => handleSelectProject(project)}
                      label={project.name}
                      description={
                        project.description
                          ? project.description.length > 50
                            ? `${project.description.substring(0, 50)}...`
                            : project.description
                          : "No description available."
                      }
                      icon={ProjectIcon}
                    />
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-xs italic text-muted-foreground dark:text-muted-foreground-night">
                  {searchQuery ? "No matches" : "No projects"}
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </ConfigurationSectionContainer>
  );
}
