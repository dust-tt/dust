import {
  FileDropProvider,
  useFileDrop,
} from "@app/components/assistant/conversation/FileUploaderContext";
import { RenameFileDialog } from "@app/components/assistant/conversation/space/RenameFileDialog";
import { ConfirmContext } from "@app/components/Confirm";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { FilePreviewSheet } from "@app/components/spaces/FilePreviewSheet";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import type { ContextAttachmentItem } from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  useAddProjectContextContentNode,
  useProjectContextAttachments,
  useRemoveProjectContextContentNode,
  useRemoveProjectContextFile,
} from "@app/lib/swr/projects";
import { useSpaces } from "@app/lib/swr/spaces";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import { getSupportedFileExtensions } from "@app/types/files";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  CloudArrowLeftRightIcon,
  DataTable,
  EmptyCTA,
  Icon,
  PencilSquareIcon,
  SearchInput,
  Spinner,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import moment from "moment";
import type React from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { InputBarAttachmentsPicker } from "../input_bar/InputBarAttachmentsPicker";

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

type ProjectKnowledgeRow = ContextAttachmentItem & {
  menuItems: MenuItem[];
  onClick: () => void;
};

function formatDate(timestamp: number): string {
  const date = moment(timestamp).fromNow();
  return date;
}

function getLastUpdatedTimestamp(row: ContextAttachmentItem): number | null {
  return (
    ("lastUpdatedAt" in row ? row.lastUpdatedAt : undefined) ??
    ("updatedAt" in row ? row.updatedAt : undefined) ??
    ("createdAt" in row ? row.createdAt : undefined) ??
    null
  );
}

export function SpaceKnowledgeTab({ owner, space }: SpaceKnowledgeTabProps) {
  return (
    <FileDropProvider>
      <DropzoneContainer
        description="Drop files here to upload knowledge."
        title="Upload Knowledge"
      >
        <SpaceKnowledgeTabContent owner={owner} space={space} />
      </DropzoneContainer>
    </FileDropProvider>
  );
}

function SpaceKnowledgeTabContent({ owner, space }: SpaceKnowledgeTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchText, setSearchText] = useState("");
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [fileToRename, setFileToRename] = useState<{
    sId: string;
    fileName: string;
  } | null>(null);
  const [selectedFile, setSelectedFile] = useState<{
    sId: string;
    fileName: string;
    contentType: string;
    projectId?: string | null;
  } | null>(null);
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const confirm = useContext(ConfirmContext);

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
  });
  const globalSpace = spaces.find((space) => space.kind === "global");

  const {
    attachments,
    isProjectContextAttachmentsLoading,
    mutateProjectContextAttachments,
  } = useProjectContextAttachments({
    owner,
    spaceId: space.sId,
  });

  const removeProjectContextFile = useRemoveProjectContextFile({
    owner,
    spaceId: space.sId,
  });

  const removeProjectContextContentNode = useRemoveProjectContextContentNode({
    owner,
    spaceId: space.sId,
  });

  const addProjectContextContentNode = useAddProjectContextContentNode({
    owner,
    spaceId: space.sId,
  });

  const projectFileUpload = useFileUploaderService({
    owner,
    useCase: "project_context",
    useCaseMetadata: {
      spaceId: space.sId,
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await projectFileUpload.handleFileChange(e);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    void mutateProjectContextAttachments();
  };

  const handleDroppedFiles = useCallback(
    async (files: File[]) => {
      await projectFileUpload.handleFilesUpload(files);
      void mutateProjectContextAttachments();
    },
    [projectFileUpload, mutateProjectContextAttachments]
  );

  // Process dropped files from the drag-and-drop context.
  const { droppedFiles, setDroppedFiles } = useFileDrop();
  useEffect(() => {
    const processDroppedFiles = async () => {
      const files = [...droppedFiles];
      if (files.length > 0) {
        setDroppedFiles([]);
        await handleDroppedFiles(files);
      }
    };
    void processDroppedFiles();
  }, [droppedFiles, setDroppedFiles, handleDroppedFiles]);

  const handleDeleteFile = async (item: ContextAttachmentItem) => {
    if (!isFileAttachmentType(item)) {
      return;
    }
    const confirmed = await confirm({
      title: "Delete file?",
      message: `Are you sure you want to delete "${item.title}"? This action cannot be undone.`,
      validateLabel: "Delete",
      validateVariant: "warning",
    });

    if (confirmed) {
      const result = await removeProjectContextFile(item.fileId);
      if (result.isOk()) {
        void mutateProjectContextAttachments();
      }
    }
  };

  const handleDeleteContentNode = async (item: ContextAttachmentItem) => {
    if (!isContentNodeAttachmentType(item)) {
      return;
    }
    const confirmed = await confirm({
      title: "Remove content node?",
      message: `Are you sure you want to remove "${item.title}" from this project?`,
      validateLabel: "Remove",
      validateVariant: "warning",
    });

    if (confirmed) {
      const result = await removeProjectContextContentNode({
        nodeId: item.nodeId,
        nodeDataSourceViewId: item.nodeDataSourceViewId,
      });
      if (result.isOk()) {
        void mutateProjectContextAttachments();
      }
    }
  };

  const openAttachment = useCallback(
    (item: ContextAttachmentItem) => {
      if (isFileAttachmentType(item)) {
        setSelectedFile({
          sId: item.fileId,
          fileName: item.title,
          contentType: item.contentType,
          projectId: space.sId,
        });
        setShowPreviewSheet(true);
        return;
      }
      if (isContentNodeAttachmentType(item) && item.sourceUrl) {
        window.open(item.sourceUrl, "_blank", "noopener,noreferrer");
      }
    },
    [space.sId]
  );

  const columns: ColumnDef<ProjectKnowledgeRow>[] = useMemo(
    () => [
      {
        id: "title",
        accessorKey: "title",
        header: "Name",
        sortingFn: "text",
        meta: {
          className: "w-full",
        },
        cell: (info: CellContext<ProjectKnowledgeRow, unknown>) => {
          const row = info.row.original;
          const FileIcon = getFileTypeIcon(row.contentType, row.title);
          return (
            <DataTable.CellContent>
              <div className="flex min-w-0 items-center gap-2">
                <Icon visual={FileIcon} size="sm" className="shrink-0" />
                <Tooltip
                  tooltipTriggerAsChild
                  label={row.title}
                  trigger={
                    <span className="min-w-0 truncate text-sm">
                      {row.title}
                    </span>
                  }
                />
              </div>
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "source",
        header: "",
        enableSorting: false,
        meta: {
          className: "w-10",
        },
        cell: (info: CellContext<ProjectKnowledgeRow, unknown>) => {
          const row = info.row.original;
          if (!isContentNodeAttachmentType(row)) {
            return null;
          }

          return (
            <DataTable.CellContent>
              <Tooltip
                tooltipTriggerAsChild
                label="Synced from a connected data source, cannot be directly edited by agents."
                trigger={
                  <span className="text-muted-foreground">
                    <Icon visual={CloudArrowLeftRightIcon} size="sm" />
                  </span>
                }
              />
            </DataTable.CellContent>
          );
        },
      },
      {
        id: "createdBy",
        accessorKey: "creator",
        header: "Added by",
        meta: {
          className: "w-20 shrink-0 sm:w-[220px]",
        },
        cell: (info: CellContext<ProjectKnowledgeRow, unknown>) => {
          const creator = info.row.original.creator;
          if (!creator?.name) {
            return <DataTable.BasicCellContent label="Unknown" />;
          }
          return (
            <DataTable.CellContent>
              <Tooltip
                tooltipTriggerAsChild
                label={creator.name}
                trigger={
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar
                      name={creator.name}
                      visual={creator.pictureUrl || undefined}
                      size="xs"
                      isRounded
                    />
                    <span className="hidden truncate text-sm sm:inline">
                      {creator.name}
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
        accessorFn: (row) => getLastUpdatedTimestamp(row) ?? 0,
        header: "Last updated",
        sortingFn: "basic",
        meta: {
          className: "w-[100px]",
        },
        cell: (info: CellContext<ProjectKnowledgeRow, unknown>) => {
          const row = info.row.original;
          const ts = getLastUpdatedTimestamp(row);
          return (
            <DataTable.BasicCellContent
              label={ts != null ? formatDate(ts) : "—"}
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
        cell: (info: CellContext<ProjectKnowledgeRow, unknown>) => {
          const items = info.row.original.menuItems;
          if (items.length === 0) {
            return null;
          }
          return <DataTable.MoreButton menuItems={items} />;
        },
      },
    ],
    []
  );

  const handleRenameClick = (item: ContextAttachmentItem) => {
    if (!isFileAttachmentType(item)) {
      return;
    }
    setFileToRename({ sId: item.fileId, fileName: item.title });
    setShowRenameDialog(true);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  const tableData: ProjectKnowledgeRow[] = useMemo(() => {
    return attachments.map((attachment) => ({
      ...attachment,
      onClick: () => openAttachment(attachment),
      menuItems: isFileAttachmentType(attachment)
        ? [
            {
              kind: "item" as const,
              label: "Rename",
              icon: PencilSquareIcon,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                handleRenameClick(attachment);
              },
            },
            {
              kind: "item" as const,
              label: "Delete",
              icon: TrashIcon,
              variant: "warning" as const,
              onClick: (e: React.MouseEvent) => {
                e.stopPropagation();
                void handleDeleteFile(attachment);
              },
            },
          ]
        : isContentNodeAttachmentType(attachment)
          ? [
              {
                kind: "item" as const,
                label: "Remove",
                icon: TrashIcon,
                variant: "warning" as const,
                onClick: (e: React.MouseEvent) => {
                  e.stopPropagation();
                  void handleDeleteContentNode(attachment);
                },
              },
            ]
          : [],
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable openAttachment / handlers
  }, [attachments]);

  const hasFiles = attachments.length > 0;
  const isUploading = projectFileUpload.isProcessingFiles;
  const uploadButtonLabel = isUploading ? "Uploading..." : "Add knowledge";

  if (isProjectContextAttachmentsLoading) {
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

  const attachButton = (
    <InputBarAttachmentsPicker
      owner={owner}
      fileUploaderService={projectFileUpload}
      onNodeSelect={async (node: DataSourceViewContentNode) => {
        const result = await addProjectContextContentNode({
          title: node.title,
          nodeId: node.internalId,
          nodeDataSourceViewId: node.dataSourceView.sId,
          ...(node.sourceUrl != null ? { url: node.sourceUrl } : {}),
        });
        if (result.isOk()) {
          void mutateProjectContextAttachments();
        }
      }}
      onNodeUnselect={(_node: DataSourceViewContentNode) => {
        // Selection state is not tracked locally; project context is updated on select only.
      }}
      onFileChange={() => {
        void mutateProjectContextAttachments();
      }}
      attachedNodes={[]}
      isLoading={isUploading}
      buttonLabel={uploadButtonLabel}
      buttonSize="sm"
      buttonVariant="outline"
      toolFileUpload={{
        useCase: "project_context",
        useCaseMetadata: {
          spaceId: space.sId,
        },
      }}
      spaceId={globalSpace?.sId}
      type="dropdown"
    />
  );

  return (
    <>
      <RenameFileDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onRenamed={() => void mutateProjectContextAttachments()}
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
        accept={getSupportedFileExtensions().join(",")}
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-8">
          <div className="flex gap-2">
            <h3 className="heading-2xl flex-1 items-center">Knowledge</h3>
            {hasFiles && attachButton}
          </div>

          {!hasFiles ? (
            <EmptyCTA
              message="No knowledge added to this project yet."
              action={attachButton}
            />
          ) : (
            <>
              <SearchInput
                name="knowledge-search"
                value={searchText}
                onChange={setSearchText}
                placeholder="Filter knowledge..."
                className="w-full"
              />
              <DataTable
                columns={columns}
                data={tableData}
                filter={searchText}
                filterColumn="title"
                sorting={[{ id: "title", desc: false }]}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
