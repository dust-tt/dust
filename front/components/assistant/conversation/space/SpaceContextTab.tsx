import { Button, CloudArrowUpIcon, EmptyCTA } from "@dust-tt/sparkle";
import React, { useRef } from "react";

import { SpaceDataSourceViewContentList } from "@app/components/spaces/SpaceDataSourceViewContentList";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { PROJECT_CONTEXT_FOLDER_ID } from "@app/lib/api/projects/constants";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import type { PlanType, SpaceType, WorkspaceType } from "@app/types";
import { getSupportedNonImageFileExtensions } from "@app/types";

interface SpaceContextTabProps {
  owner: WorkspaceType;
  space: SpaceType;
  systemSpace: SpaceType;
  plan: PlanType;
  isAdmin: boolean;
  canReadInSpace: boolean;
  canWriteInSpace: boolean;
}

export function SpaceContextTab({
  owner,
  space,
  systemSpace,
  plan,
  isAdmin,
  canReadInSpace,
  canWriteInSpace,
}: SpaceContextTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { spaceDataSourceViews, isSpaceDataSourceViewsLoading } =
    useSpaceDataSourceViews({
      workspaceId: owner.sId,
      spaceId: space.sId,
      category: "managed",
    });

  // Find the project context data source view
  const projectDataSourceView =
    spaceDataSourceViews.find(
      (dsv) => dsv.dataSource.connectorProvider === "dust_project"
    ) ?? null;

  const projectFileUpload = useFileUploaderService({
    owner,
    useCase: "project_context",
    useCaseMetadata: {
      spaceId: space.sId,
    },
  });

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await projectFileUpload.handleFileChange(e);
    // Clear the input so the same file can be uploaded again if needed.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (isSpaceDataSourceViewsLoading) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <div className="text-center text-muted-foreground dark:text-muted-foreground-night">
          Loading project context...
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept={getSupportedNonImageFileExtensions().join(",")}
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      </div>
      {projectDataSourceView ? (
        <>
          <div className="my-2 flex justify-end">
            <Button
              variant="primary"
              label={
                projectFileUpload.isProcessingFiles
                  ? "Uploading..."
                  : "Upload Files"
              }
              icon={CloudArrowUpIcon}
              onClick={handleUploadClick}
              disabled={projectFileUpload.isProcessingFiles}
            />
          </div>
          <SpaceDataSourceViewContentList
            canReadInSpace={canReadInSpace}
            canWriteInSpace={canWriteInSpace}
            connector={null}
            dataSourceView={projectDataSourceView}
            isAdmin={isAdmin}
            onSelect={() => {}}
            owner={owner}
            plan={plan}
            space={space}
            parentId={PROJECT_CONTEXT_FOLDER_ID}
            systemSpace={systemSpace}
            useCaseForDocument={"project_context"}
          />
        </>
      ) : (
        <div className="flex w-full items-center justify-center p-8">
          <EmptyCTA
            message="No project context, add files to get started!"
            action={
              <Button
                variant="primary"
                label={
                  projectFileUpload.isProcessingFiles
                    ? "Uploading..."
                    : "Upload Files"
                }
                icon={CloudArrowUpIcon}
                onClick={handleUploadClick}
                disabled={projectFileUpload.isProcessingFiles}
              />
            }
          />
        </div>
      )}
    </>
  );
}
