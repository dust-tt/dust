import {
  FileDropProvider,
  useFileDrop,
} from "@app/components/assistant/conversation/FileUploaderContext";
import { RenameFileDialog } from "@app/components/assistant/conversation/space/RenameFileDialog";
import { ConfirmContext } from "@app/components/Confirm";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { FilePreviewSheet } from "@app/components/spaces/FilePreviewSheet";
import SpaceManagedDatasourcesViewsModal from "@app/components/spaces/SpaceManagedDatasourcesViewsModal";
import { useDebounce } from "@app/hooks/useDebounce";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import type {
  ContextAttachmentItem,
  FileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import config from "@app/lib/api/config";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { useAppRouter } from "@app/lib/platform";
import {
  useAddProjectContextContentNodes,
  useProjectContextAttachments,
  useProjectFiles,
  useRemoveProjectContextContentNodes,
  useRemoveProjectContextFile,
} from "@app/lib/swr/projects";
import { useSpaceDataSourceViews, useSpaces } from "@app/lib/swr/spaces";
import { isManualProjectKnowledgeManagementAllowed } from "@app/lib/workspace_policies";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types/data_source_view";
import { getSupportedFileExtensions } from "@app/types/files";
import type { ProjectType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  Avatar,
  Button,
  CloudArrowLeftRightIcon,
  CloudArrowUpIcon,
  DataTable,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyCTA,
  Icon,
  PencilSquareIcon,
  PlusIcon,
  SearchInput,
  Spinner,
  Tooltip,
  TrashIcon,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import moment from "moment";
import type React from "react";
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface SpaceKnowledgeTabProps {
  owner: WorkspaceType;
  space: ProjectType;
}

const PROJECT_KNOWLEDGE_MANAGEMENT_DISABLED_TOOLTIP =
  "Adding files to projects is disabled by your workspace admin.";

// TODO(2026-05 FILE SYSTEM): Remove once the file explorer supports rendering
// path-only files natively. Sentinel id needed today to squeeze path-only entries
// through the existing `FileAttachmentType`-shaped table rows.
const AGENT_FILE_ID_PREFIX = "agent-file:";

function isAgentFileId(fileId: string): boolean {
  return fileId.startsWith(AGENT_FILE_ID_PREFIX);
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

function knowledgeRowKindRank(row: ProjectKnowledgeRow): number {
  if (isContentNodeAttachmentType(row)) {
    return 0;
  }
  if (isFileAttachmentType(row)) {
    return 1;
  }
  return 2;
}

function compareKnowledgeRowsByKindThenTitle(
  a: ProjectKnowledgeRow,
  b: ProjectKnowledgeRow
): number {
  const diff = knowledgeRowKindRank(a) - knowledgeRowKindRank(b);
  if (diff !== 0) {
    return diff;
  }
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

type KnowledgeFilteredDataTableProps = {
  columns: ColumnDef<ProjectKnowledgeRow>[];
  data: ProjectKnowledgeRow[];
  filter: string;
};

const KnowledgeFilteredDataTable = memo(function KnowledgeFilteredDataTable({
  columns,
  data,
  filter,
}: KnowledgeFilteredDataTableProps) {
  return (
    <DataTable
      columns={columns}
      data={data}
      filter={filter}
      filterColumn="title"
      sorting={[{ id: "title", desc: false }]}
    />
  );
});

type KnowledgeSearchAndTableProps = {
  columns: ColumnDef<ProjectKnowledgeRow>[];
  data: ProjectKnowledgeRow[];
};

/** Debounced search lives here so typing does not rerender `SpaceKnowledgeTabContent`. */
const KnowledgeSearchAndTable = memo(function KnowledgeSearchAndTable({
  columns,
  data,
}: KnowledgeSearchAndTableProps) {
  const { inputValue, debouncedValue, setValue } = useDebounce("", {
    delay: 200,
  });

  return (
    <>
      <SearchInput
        name="files-search"
        value={inputValue}
        onChange={setValue}
        placeholder="Filter..."
        className="w-full"
      />
      <KnowledgeFilteredDataTable
        columns={columns}
        data={data}
        filter={debouncedValue}
      />
    </>
  );
});

type AttachKnowledgeDropdownProps = {
  buttonLabel: string;
  isDisabled: boolean;
  onUploadFileClick: () => void;
  onShowCompanyDataClick: () => void;
};

function AttachKnowledgeDropdown({
  buttonLabel,
  isDisabled,
  onUploadFileClick,
  onShowCompanyDataClick,
}: AttachKnowledgeDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button label={buttonLabel} icon={PlusIcon} disabled={isDisabled} />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          icon={CloudArrowUpIcon}
          label="Upload file"
          onClick={onUploadFileClick}
        />
        <DropdownMenuItem
          icon={CloudArrowLeftRightIcon}
          label="From Company Data"
          onClick={onShowCompanyDataClick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type AttachKnowledgeButtonProps = AttachKnowledgeDropdownProps & {
  canManuallyManageProjectKnowledge: boolean;
};

function AttachKnowledgeButton({
  buttonLabel,
  canManuallyManageProjectKnowledge,
  isDisabled,
  onShowCompanyDataClick,
  onUploadFileClick,
}: AttachKnowledgeButtonProps) {
  if (canManuallyManageProjectKnowledge) {
    return (
      <AttachKnowledgeDropdown
        buttonLabel={buttonLabel}
        isDisabled={isDisabled}
        onShowCompanyDataClick={onShowCompanyDataClick}
        onUploadFileClick={onUploadFileClick}
      />
    );
  }
  return (
    <Tooltip
      label={PROJECT_KNOWLEDGE_MANAGEMENT_DISABLED_TOOLTIP}
      trigger={
        <div>
          <AttachKnowledgeDropdown
            buttonLabel={buttonLabel}
            isDisabled={isDisabled}
            onShowCompanyDataClick={onShowCompanyDataClick}
            onUploadFileClick={onUploadFileClick}
          />
        </div>
      }
    />
  );
}

type NoCompanyDataDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onGoToCompanyData: () => void;
};

function NoCompanyDataDialog({
  isOpen,
  onClose,
  onGoToCompanyData,
}: NoCompanyDataDialogProps) {
  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>No data available in Company Data</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          There is no data available in Company Data yet. Go to Company Data to
          add data.
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Close",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Go to Company Data",
            variant: "primary",
            onClick: onGoToCompanyData,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function SpaceKnowledgeTab({ owner, space }: SpaceKnowledgeTabProps) {
  const isArchived = !!space.archivedAt;

  if (isArchived) {
    return <SpaceKnowledgeTabContent owner={owner} space={space} />;
  }

  return (
    <FileDropProvider>
      <DropzoneContainer
        description="Drop files here to upload them."
        title="Upload files"
      >
        <SpaceKnowledgeTabContent owner={owner} space={space} />
      </DropzoneContainer>
    </FileDropProvider>
  );
}

function SpaceKnowledgeTabContent({ owner, space }: SpaceKnowledgeTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const [showCompanyDataSheet, setShowCompanyDataSheet] = useState(false);
  const [showNoCompanyDataDialog, setShowNoCompanyDataDialog] = useState(false);
  const isArchived = !!space.archivedAt;
  const canManuallyManageProjectKnowledge =
    isManualProjectKnowledgeManagementAllowed(owner);
  const confirm = useContext(ConfirmContext);

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
  });
  const globalSpace = spaces.find((space) => space.kind === "global");

  const { spaceDataSourceViews: globalSpaceDSVs } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: globalSpace?.sId ?? "",
    disabled: !globalSpace,
  });

  const router = useAppRouter();

  const {
    attachments: contentNodeAttachments,
    isProjectContextAttachmentsLoading,
    mutateProjectContextAttachments,
  } = useProjectContextAttachments({
    owner,
    spaceId: space.sId,
  });

  const {
    files: projectGCSFiles,
    isProjectFilesLoading,
    mutateProjectFiles,
  } = useProjectFiles({
    owner,
    spaceId: space.sId,
  });

  const fileAttachments = useMemo<FileAttachmentType[]>(() => {
    const out: FileAttachmentType[] = [];
    for (const entry of projectGCSFiles) {
      if (entry.isDirectory) {
        continue;
      }
      out.push({
        title: entry.fileName,
        contentType: entry.contentType as FileAttachmentType["contentType"],
        contentFragmentVersion: "latest",
        snippet: null,
        generatedTables: [],
        isIncludable: true,
        isSearchable: true,
        isQueryable: false,
        isInProjectContext: true,
        creator: null,
        hidden: false,
        fileId: entry.fileId ?? `${AGENT_FILE_ID_PREFIX}${entry.path}`,
        path: entry.path,
        source: null,
        createdAt: entry.lastModifiedMs,
        updatedAt: entry.lastModifiedMs,
      });
    }
    return out;
  }, [projectGCSFiles]);

  const attachments = useMemo<ContextAttachmentItem[]>(
    () => [...contentNodeAttachments, ...fileAttachments],
    [contentNodeAttachments, fileAttachments]
  );

  const removeProjectContextFile = useRemoveProjectContextFile({
    owner,
    spaceId: space.sId,
  });

  const removeProjectContextContentNodes = useRemoveProjectContextContentNodes({
    owner,
    spaceId: space.sId,
  });

  const addProjectContextContentNodes = useAddProjectContextContentNodes({
    owner,
    spaceId: space.sId,
  });

  const projectFileUpload = useFileUploaderService({
    hasSandboxTools: false,
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
    void mutateProjectFiles();
  };

  const handleDroppedFiles = useCallback(
    async (files: File[]) => {
      await projectFileUpload.handleFilesUpload(files);
      void mutateProjectFiles();
    },
    [projectFileUpload, mutateProjectFiles]
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
        void mutateProjectFiles();
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
      const result = await removeProjectContextContentNodes([
        {
          nodeId: item.nodeId,
          nodeDataSourceViewId: item.nodeDataSourceViewId,
        },
      ]);
      if (result.isOk()) {
        void mutateProjectContextAttachments();
      }
    }
  };

  const openAttachment = useCallback(
    (item: ContextAttachmentItem) => {
      if (isFileAttachmentType(item)) {
        if (isAgentFileId(item.fileId) && item.path) {
          const rel = item.path.replace(/^project\//, "");
          window.open(
            `${config.getApiBaseUrl()}/api/w/${owner.sId}/spaces/${space.sId}/files/${rel}`,
            "_blank",
            "noopener,noreferrer"
          );
          return;
        }
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
    [owner.sId, space.sId]
  );

  const columns: ColumnDef<ProjectKnowledgeRow>[] = useMemo(
    () => [
      {
        id: "title",
        accessorKey: "title",
        header: "Name",
        sortingFn: (rowA, rowB) =>
          compareKnowledgeRowsByKindThenTitle(rowA.original, rowB.original),
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
        header: "By",
        meta: {
          className: "w-12 min-w-12 max-w-12 sm:w-14 sm:min-w-14 sm:max-w-14",
          tooltip: "Added by",
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
                  <span className="inline-flex cursor-default">
                    <Avatar
                      name={creator.name}
                      visual={creator.pictureUrl || undefined}
                      size="xs"
                      isRounded
                    />
                  </span>
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
          className:
            "min-w-[100px] w-[100px] max-w-[100px] whitespace-nowrap sm:min-w-[112px] sm:w-[112px] sm:max-w-[112px]",
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
      ...(!isArchived
        ? [
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
          ]
        : []),
    ],
    [isArchived]
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
        ? isAgentFileId(attachment.fileId)
          ? []
          : [
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
  const uploadButtonLabel = isUploading ? "Uploading..." : "Add data";
  const isAddKnowledgeDisabled =
    !canManuallyManageProjectKnowledge || isUploading;

  const handleUploadFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleShowCompanyDataClick = useCallback(() => {
    if (globalSpaceDSVs.length === 0) {
      setShowNoCompanyDataDialog(true);
      return;
    }
    setShowCompanyDataSheet(true);
  }, [globalSpaceDSVs.length]);

  const handleCloseCompanyDataSheet = useCallback(() => {
    setShowCompanyDataSheet(false);
  }, []);

  const handleCloseNoCompanyDataDialog = useCallback(() => {
    setShowNoCompanyDataDialog(false);
  }, []);

  const handleGoToCompanyData = useCallback(() => {
    if (!globalSpace) {
      return;
    }
    void router.push(`/w/${owner.sId}/spaces/${globalSpace.sId}`);
  }, [globalSpace, owner.sId, router]);

  const initialSelectedDataSources = useMemo<DataSourceViewType[]>(() => {
    const nodeIdsByDsvId = new Map<string, string[]>();
    for (const attachment of attachments) {
      if (!isContentNodeAttachmentType(attachment)) {
        continue;
      }
      const existing =
        nodeIdsByDsvId.get(attachment.nodeDataSourceViewId) ?? [];
      nodeIdsByDsvId.set(attachment.nodeDataSourceViewId, [
        ...existing,
        attachment.nodeId,
      ]);
    }
    return Array.from(nodeIdsByDsvId.entries()).flatMap(([dsvId, nodeIds]) => {
      const dsv = globalSpaceDSVs.find((v) => v.sId === dsvId);
      return dsv ? [{ ...dsv, parentsIn: nodeIds }] : [];
    });
  }, [attachments, globalSpaceDSVs]);

  const handleCompanyDataSave = useCallback(
    async (selectionConfigurations: DataSourceViewSelectionConfigurations) => {
      // 1. Flatten modal selection into a list of nodes.
      const selectedNodes = Object.values(selectionConfigurations).flatMap(
        ({ dataSourceView, selectedResources }) =>
          selectedResources.map((node) => ({
            title: node.title,
            nodeId: node.internalId,
            nodeDataSourceViewId: dataSourceView.sId,
            sourceUrl: node.sourceUrl,
          }))
      );

      // 2. Build identity keys for both sides of the diff.
      const keyOf = (n: { nodeDataSourceViewId: string; nodeId: string }) =>
        `${n.nodeDataSourceViewId}:${n.nodeId}`;
      const currentContentNodes = attachments.filter(
        isContentNodeAttachmentType
      );
      const currentKeys = new Set(currentContentNodes.map(keyOf));
      const selectedKeys = new Set(selectedNodes.map(keyOf));

      // 3. Diff.
      const toAdd = selectedNodes.filter((n) => !currentKeys.has(keyOf(n)));
      const toRemove = currentContentNodes.filter(
        (n) => !selectedKeys.has(keyOf(n))
      );

      // 4. Apply both sides
      await addProjectContextContentNodes(
        toAdd.map((n) => ({
          title: n.title,
          nodeId: n.nodeId,
          nodeDataSourceViewId: n.nodeDataSourceViewId,
          ...(n.sourceUrl ? { url: n.sourceUrl } : {}),
        }))
      );
      await removeProjectContextContentNodes(
        toRemove.map((n) => ({
          nodeId: n.nodeId,
          nodeDataSourceViewId: n.nodeDataSourceViewId,
        }))
      );

      // 5. Refresh.
      void mutateProjectContextAttachments();
    },
    [
      addProjectContextContentNodes,
      attachments,
      mutateProjectContextAttachments,
      removeProjectContextContentNodes,
    ]
  );

  if (isProjectContextAttachmentsLoading || isProjectFilesLoading) {
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

      {globalSpace && (
        <SpaceManagedDatasourcesViewsModal
          isOpen={showCompanyDataSheet}
          isRootSelectable={false}
          onClose={handleCloseCompanyDataSheet}
          onSave={handleCompanyDataSave}
          owner={owner}
          space={globalSpace}
          systemSpace={globalSpace}
          systemSpaceDataSourceViews={globalSpaceDSVs}
          initialSelectedDataSources={initialSelectedDataSources}
          title="Add data from Company Data"
        />
      )}

      <NoCompanyDataDialog
        isOpen={showNoCompanyDataDialog}
        onClose={handleCloseNoCompanyDataDialog}
        onGoToCompanyData={handleGoToCompanyData}
      />

      {!isArchived && (
        <input
          ref={fileInputRef}
          type="file"
          accept={getSupportedFileExtensions().join(",")}
          multiple
          style={{ display: "none" }}
          onChange={handleFileChange}
        />
      )}

      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-y-auto px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 py-8">
          <div className="flex gap-2">
            <h3 className="heading-2xl flex-1 items-center">Files</h3>
            {hasFiles && !isArchived && (
              <AttachKnowledgeButton
                buttonLabel={uploadButtonLabel}
                canManuallyManageProjectKnowledge={
                  canManuallyManageProjectKnowledge
                }
                isDisabled={isAddKnowledgeDisabled}
                onShowCompanyDataClick={handleShowCompanyDataClick}
                onUploadFileClick={handleUploadFileClick}
              />
            )}
          </div>

          {!hasFiles ? (
            <EmptyCTA
              message={
                isArchived
                  ? "This project is archived. No files have been added."
                  : "No files have been added to this project yet."
              }
              action={
                isArchived ? null : (
                  <AttachKnowledgeButton
                    buttonLabel={uploadButtonLabel}
                    canManuallyManageProjectKnowledge={
                      canManuallyManageProjectKnowledge
                    }
                    isDisabled={isAddKnowledgeDisabled}
                    onShowCompanyDataClick={handleShowCompanyDataClick}
                    onUploadFileClick={handleUploadFileClick}
                  />
                )
              }
            />
          ) : (
            <KnowledgeSearchAndTable columns={columns} data={tableData} />
          )}
        </div>
      </div>
    </>
  );
}
