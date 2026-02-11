import {
  ArrowUpOnSquareIcon,
  Avatar,
  Button,
  DataTable,
  EmptyCTA,
  EmptyCTAButton,
  Icon,
  PencilSquareIcon,
  SearchInput,
  Spinner,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import moment from "moment";
import React, { useContext, useMemo, useRef, useState } from "react";

import { RenameFileDialog } from "@app/components/assistant/conversation/space/RenameFileDialog";
import { ConfirmContext } from "@app/components/Confirm";
import { FilePreviewSheet } from "@app/components/spaces/FilePreviewSheet";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import type { FileWithCreatorType } from "@app/lib/swr/projects";
import { useDeleteProjectFile, useProjectFiles } from "@app/lib/swr/projects";
import type { SpaceType, WorkspaceType } from "@app/types";
import { getSupportedNonImageFileExtensions } from "@app/types";

interface SpaceKnowledgeTabProps {
  owner: WorkspaceType;
  space: SpaceType;
}

type MenuItem = {
  kind: "item";
  label: string;
  icon: typeof TrashIcon;
  variant?: "warning";
  onClick: (e: React.MouseEvent) => void;
};

type ProjectFileWithActions = FileWithCreatorType & {
  menuItems: MenuItem[];
  onClick: () => void;
};

function formatDate(timestamp: number): string {
  const date = moment(timestamp).fromNow();
  return date;
}

export function SpaceKnowledgeTab({ owner, space }: SpaceKnowledgeTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [fileToRename, setFileToRename] = useState<FileWithCreatorType | null>(
    null
  );
  const [selectedFile, setSelectedFile] = useState<FileWithCreatorType | null>(
    null
  );
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const confirm = useContext(ConfirmContext);

  const { projectFiles, isProjectFilesLoading, mutateProjectFiles } =
    useProjectFiles({
      owner,
      projectId: space.sId,
    });

  const deleteProjectFile = useDeleteProjectFile({ owner });

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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    void mutateProjectFiles();
  };

  const handleDeleteFile = async (file: FileWithCreatorType) => {
    const confirmed = await confirm({
      title: "Delete file?",
      message: `Are you sure you want to delete "${file.fileName}"? This action cannot be undone.`,
      validateLabel: "Delete",
      validateVariant: "warning",
    });

    if (confirmed) {
      const result = await deleteProjectFile(file.sId);
      if (result.isOk()) {
        void mutateProjectFiles();
      }
    }
  };

  const columns: ColumnDef<ProjectFileWithActions>[] = useMemo(
    () => [
      {
        id: "fileName",
        accessorKey: "fileName",
        header: "File name",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info: CellContext<ProjectFileWithActions, unknown>) => {
          const file = info.row.original;
          const FileIcon = getFileTypeIcon(file.contentType, file.fileName);
          return (
            <DataTable.CellContent>
              <div className="flex min-w-0 items-center gap-2">
                <Icon visual={FileIcon} size="sm" className="shrink-0" />
                <Tooltip
                  tooltipTriggerAsChild
                  label={file.fileName}
                  trigger={
                    <span className="min-w-0 truncate text-sm">
                      {file.fileName}
                    </span>
                  }
                />
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "createdBy",
        accessorKey: "user",
        header: "Created by",
        meta: {
          className: "w-20 shrink-0 sm:w-[220px]",
        },
        cell: (info: CellContext<ProjectFileWithActions, unknown>) => {
          const user = info.row.original.user;
          if (!user || !user.name) {
            return <DataTable.BasicCellContent label="Unknown" />;
          }
          return (
            <DataTable.CellContent>
              <Tooltip
                tooltipTriggerAsChild
                label={user.name}
                trigger={
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      name={user.name}
                      visual={user.imageUrl ?? undefined}
                      size="xs"
                      isRounded
                    />
                    <span className="hidden truncate text-sm sm:inline">
                      {user.name}
                    </span>
                  </div>
                }
              />
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "lastUpdated",
        accessorKey: "updatedAt",
        header: "Last Updated",
        meta: {
          className: "w-[100px]",
        },
        cell: (info: CellContext<ProjectFileWithActions, unknown>) => {
          return (
            <DataTable.BasicCellContent
              label={formatDate(info.row.original.updatedAt)}
            />
          );
        },
      },
      {
        id: "actions",
        header: "",
        meta: {
          className: "w-12",
        },
        cell: (info: CellContext<ProjectFileWithActions, unknown>) => (
          <DataTable.MoreButton menuItems={info.row.original.menuItems} />
        ),
      },
    ],
    []
  );

  const handleRenameClick = (file: FileWithCreatorType) => {
    setFileToRename(file);
    setShowRenameDialog(true);
  };

  const handleFileClick = (file: FileWithCreatorType) => {
    setSelectedFile(file);
    setShowPreviewSheet(true);
  };

  const tableData: ProjectFileWithActions[] = useMemo(() => {
    return projectFiles.map((file) => ({
      ...file,
      onClick: () => handleFileClick(file),
      menuItems: [
        {
          kind: "item" as const,
          label: "Rename",
          icon: PencilSquareIcon,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            handleRenameClick(file);
          },
        },
        {
          kind: "item" as const,
          label: "Delete",
          icon: TrashIcon,
          variant: "warning" as const,
          onClick: (e: React.MouseEvent) => {
            e.stopPropagation();
            void handleDeleteFile(file);
          },
        },
      ],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only use stable state setters
  }, [projectFiles]);

  const hasFiles = projectFiles.length > 0;
  const isUploading = projectFileUpload.isProcessingFiles;
  const uploadButtonLabel = isUploading ? "Uploading..." : "Add knowledge";

  if (isProjectFilesLoading) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
        <div className="mx-auto flex w-full flex-col gap-4 py-8">
          <div className="flex w-full items-center justify-center p-8">
            <Spinner />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <RenameFileDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onRenamed={() => void mutateProjectFiles()}
        owner={owner}
        file={fileToRename}
      />

      <FilePreviewSheet
        owner={owner}
        file={selectedFile}
        isOpen={showPreviewSheet}
        onOpenChange={setShowPreviewSheet}
      />

      <input
        ref={fileInputRef}
        type="file"
        accept={getSupportedNonImageFileExtensions().join(",")}
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-8">
          <div className="flex gap-2">
            <h3 className="heading-2xl flex-1 items-center">Knowledge</h3>
            {hasFiles && (
              <Button
                variant="outline"
                icon={ArrowUpOnSquareIcon}
                label={uploadButtonLabel}
                onClick={handleUploadClick}
                disabled={isUploading}
                isLoading={isUploading}
              />
            )}
          </div>

          {!hasFiles ? (
            <EmptyCTA
              message="No knowledge files in this room yet."
              action={
                <EmptyCTAButton
                  icon={ArrowUpOnSquareIcon}
                  label={uploadButtonLabel}
                  onClick={handleUploadClick}
                  disabled={isUploading}
                  isLoading={isUploading}
                />
              }
            />
          ) : (
            <>
              <SearchInput
                name="knowledge-search"
                value={searchText}
                onChange={setSearchText}
                placeholder="Search files..."
                className="w-full"
              />
              <DataTable
                columns={columns}
                data={tableData}
                filter={searchText}
                filterColumn="fileName"
                sorting={[{ id: "fileName", desc: false }]}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
