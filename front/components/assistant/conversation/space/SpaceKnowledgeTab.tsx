import {
  ArrowUpOnSquareIcon,
  Avatar,
  Button,
  DataTable,
  EmptyCTA,
  EmptyCTAButton,
  Icon,
  SearchInput,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import React, { useContext, useMemo, useRef, useState } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import type { ProjectFileType } from "@app/lib/swr/projects";
import { useDeleteProjectFile, useProjectFiles } from "@app/lib/swr/projects";
import type { SpaceType, WorkspaceType } from "@app/types";
import { getSupportedNonImageFileExtensions } from "@app/types";

interface SpaceKnowledgeTabProps {
  owner: WorkspaceType;
  space: SpaceType;
}

type ProjectFileWithActions = ProjectFileType & {
  menuItems: {
    kind: "item";
    label: string;
    icon: typeof TrashIcon;
    variant: "warning";
    onClick: (e: React.MouseEvent) => void;
  }[];
};

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SpaceKnowledgeTab({ owner, space }: SpaceKnowledgeTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
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

  const handleDeleteFile = async (file: ProjectFileType) => {
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
              <div className="flex items-center gap-2">
                <Icon visual={FileIcon} size="sm" />
                <span>{file.fileName}</span>
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
          className: "w-[180px]",
        },
        cell: (info: CellContext<ProjectFileWithActions, unknown>) => {
          const user = info.row.original.user;
          if (!user || !user.name) {
            return <DataTable.BasicCellContent label="Unknown" />;
          }
          return (
            <DataTable.CellContent>
              <div className="flex items-center gap-2">
                <Avatar
                  name={user.name}
                  visual={user.imageUrl ?? undefined}
                  size="xs"
                  isRounded
                />
                <span className="text-sm">{user.name}</span>
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "lastUpdated",
        accessorKey: "updatedAt",
        header: "Last Updated",
        meta: {
          className: "w-[140px]",
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

  const tableData: ProjectFileWithActions[] = useMemo(() => {
    return projectFiles.map((file) => ({
      ...file,
      menuItems: [
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      <input
        ref={fileInputRef}
        type="file"
        accept={getSupportedNonImageFileExtensions().join(",")}
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
        <div className="mx-auto flex w-full flex-col gap-4 py-8">
          <div className="flex gap-2">
            <h3 className="heading-2xl flex-1 items-center">Knowledge</h3>
            {hasFiles && (
              <Button
                variant="outline"
                icon={ArrowUpOnSquareIcon}
                label={uploadButtonLabel}
                onClick={handleUploadClick}
                disabled={isUploading}
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
