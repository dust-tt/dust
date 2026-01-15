import { Button, CloudArrowUpIcon, EmptyCTA } from "@dust-tt/sparkle";
import React, { useRef } from "react";

import { SpaceContextFileList } from "@app/components/assistant/conversation/space/SpaceContextFileList";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useProjectFiles } from "@app/lib/swr/projects";
import type { PlanType, SpaceType, WorkspaceType } from "@app/types";
import { getSupportedNonImageFileExtensions } from "@app/types";

interface SpaceContextTabProps {
  owner: WorkspaceType;
  space: SpaceType;
  plan: PlanType;
  isAdmin: boolean;
  canReadInSpace: boolean;
  canWriteInSpace: boolean;
}

export function SpaceContextTab({ owner, space }: SpaceContextTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { projectFiles, mutateProjectFiles } = useProjectFiles({
    owner,
    projectId: space.sId,
  });

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
    // Refresh the file list after upload
    void mutateProjectFiles();
  };

  const hasFiles = projectFiles.length > 0;

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
      {hasFiles ? (
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

          <SpaceContextFileList owner={owner} spaceId={space.sId} />
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
