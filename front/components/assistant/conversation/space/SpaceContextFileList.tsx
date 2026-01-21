import { Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

import { AttachmentCitation } from "@app/components/assistant/conversation/attachment/AttachmentCitation";
import { markdownCitationToAttachmentCitation } from "@app/components/assistant/conversation/attachment/utils";
import type { ActionGeneratedFileType } from "@app/lib/actions/types";
import { useProjectFiles } from "@app/lib/swr/projects";
import type { LightWorkspaceType, WorkspaceType } from "@app/types";

interface SpaceContextFileListProps {
  owner: WorkspaceType;
  spaceId: string;
}

interface FileGroup {
  files: ActionGeneratedFileType[];
  key: string;
  title: string;
}

function groupFilesByContentType(
  files: ActionGeneratedFileType[]
): FileGroup[] {
  const textFiles: ActionGeneratedFileType[] = [];
  const imageFiles: ActionGeneratedFileType[] = [];
  const otherFiles: ActionGeneratedFileType[] = [];

  for (const file of files) {
    if (file.contentType.startsWith("image/")) {
      imageFiles.push(file);
    } else if (
      file.contentType.startsWith("text/") ||
      file.contentType === "application/json"
    ) {
      textFiles.push(file);
    } else {
      otherFiles.push(file);
    }
  }

  const groups: FileGroup[] = [];

  if (textFiles.length > 0) {
    groups.push({
      key: "text",
      title: "Text",
      files: textFiles,
    });
  }

  if (imageFiles.length > 0) {
    groups.push({
      key: "images",
      title: "Images",
      files: imageFiles,
    });
  }

  if (otherFiles.length > 0) {
    groups.push({
      key: "others",
      title: "Others",
      files: otherFiles,
    });
  }

  return groups;
}

interface FileRendererProps {
  files: ActionGeneratedFileType[];
  owner: LightWorkspaceType;
}

const FileRenderer = ({ files, owner }: FileRendererProps) => (
  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
    {files.map((file, index) => {
      const attachmentCitation = markdownCitationToAttachmentCitation({
        href: `/api/w/${owner.sId}/files/${file.fileId}`,
        title: file.title,
        contentType: file.contentType,
        fileId: file.fileId,
      });

      return (
        <AttachmentCitation
          key={index}
          attachmentCitation={attachmentCitation}
          owner={owner}
          conversationId={null}
        />
      );
    })}
  </div>
);

interface FileGroupSectionProps {
  group: FileGroup;
  owner: LightWorkspaceType;
}

const FileGroupSection = ({ group, owner }: FileGroupSectionProps) => {
  return (
    <div className="space-y-3">
      <div className="text-element-900 text-sm font-medium">{group.title}</div>
      <div className="flex flex-col gap-4">
        <FileRenderer files={group.files} owner={owner} />
      </div>
    </div>
  );
};

export function SpaceContextFileList({
  owner,
  spaceId,
}: SpaceContextFileListProps) {
  const { projectFiles, isProjectFilesLoading, isProjectFilesError } =
    useProjectFiles({
      owner,
      projectId: spaceId,
    });

  // Convert project files to ActionGeneratedFileType format
  const actionFiles: ActionGeneratedFileType[] = useMemo(
    () =>
      projectFiles.map((file) => ({
        fileId: file.sId,
        title: file.fileName,
        contentType: file.contentType,
        snippet: null,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      })),
    [projectFiles]
  );

  const fileGroups = useMemo(
    () => groupFilesByContentType(actionFiles),
    [actionFiles]
  );

  if (isProjectFilesLoading) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (isProjectFilesError) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <div className="text-center text-warning">
          Failed to load project files. Please try again.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {fileGroups.map((group) => (
        <FileGroupSection key={group.key} group={group} owner={owner} />
      ))}
    </div>
  );
}
