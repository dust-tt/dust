import {
  Button,
  Card,
  Chip,
  ExternalLinkIcon,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import { useState } from "react";

import { ProjectMetadataEditForm } from "@app/components/assistant/conversation/space/about/ProjectMetadataEditForm";
import type {
  LightWorkspaceType,
  ProjectMetadataType,
  ProjectStatus,
  SpaceType,
} from "@app/types";

interface ProjectMetadataSectionProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  projectMetadata: ProjectMetadataType | null;
  canEdit: boolean;
}

const STATUS_COLORS: Record<
  ProjectStatus,
  "success" | "warning" | "info" | "white"
> = {
  active: "success",
  paused: "warning",
  completed: "info",
  archived: "white",
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  archived: "Archived",
};

export function ProjectMetadataSection({
  owner,
  space,
  projectMetadata,
  canEdit,
}: ProjectMetadataSectionProps) {
  const [isEditing, setIsEditing] = useState(false);

  if (isEditing) {
    return (
      <ProjectMetadataEditForm
        owner={owner}
        space={space}
        projectMetadata={projectMetadata}
        onClose={() => setIsEditing(false)}
      />
    );
  }

  const hasMetadata =
    projectMetadata &&
    (!!projectMetadata.description ||
      (projectMetadata.tags !== null && projectMetadata.tags.length > 0) ||
      (projectMetadata.externalLinks !== null &&
        projectMetadata.externalLinks.length > 0));

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Project Information</h3>
        {canEdit && (
          <Button
            variant="outline"
            label="Edit"
            icon={PencilSquareIcon}
            size="sm"
            onClick={() => setIsEditing(true)}
          />
        )}
      </div>

      {hasMetadata ? (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Status:</span>
            <Chip
              color={
                STATUS_COLORS[projectMetadata.status] ?? STATUS_COLORS.active
              }
              label={STATUS_LABELS[projectMetadata.status] ?? "Active"}
              size="sm"
            />
          </div>

          {projectMetadata.description && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-muted-foreground">
                Description
              </span>
              <p className="whitespace-pre-wrap text-sm text-foreground">
                {projectMetadata.description}
              </p>
            </div>
          )}

          {projectMetadata.tags && projectMetadata.tags.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Tags
              </span>
              <div className="flex flex-wrap gap-2">
                {projectMetadata.tags.map((tag, index) => (
                  <Chip key={index} color="white" label={tag} size="xs" />
                ))}
              </div>
            </div>
          )}

          {projectMetadata.externalLinks &&
            projectMetadata.externalLinks.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  External Links
                </span>
                <div className="flex flex-col gap-1">
                  {projectMetadata.externalLinks.map((link, index) => (
                    <a
                      key={index}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-action-600 hover:text-action-700"
                    >
                      <ExternalLinkIcon className="h-4 w-4" />
                      {link.title}
                    </a>
                  ))}
                </div>
              </div>
            )}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm text-muted-foreground">
            No project information yet.{" "}
            {canEdit && "Click Edit to add details."}
          </p>
        </div>
      )}
    </Card>
  );
}
