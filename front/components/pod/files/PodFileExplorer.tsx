import {
  FileDropProvider,
  useFileDrop,
} from "@app/components/assistant/conversation/FileUploaderContext";
import { ConfirmContext } from "@app/components/Confirm";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerEntry,
  FileExplorerMenuAction,
  FolderEntry,
} from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { joinMountRelativePath } from "@app/components/file_explorer/utils";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import { CreateFolderDialog } from "@app/components/pod/files/CreateFolderDialog";
import { PodFrameSheet } from "@app/components/pod/files/PodFrameSheet";
import { RenameFileDialog } from "@app/components/pod/files/RenameFileDialog";
import SpaceManagedDatasourcesViewsModal from "@app/components/spaces/SpaceManagedDatasourcesViewsModal";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { usePinPodBanner } from "@app/hooks/usePinPodBanner";
import type { ContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import config from "@app/lib/api/config";
import { useAppRouter } from "@app/lib/platform";
import { downloadFile } from "@app/lib/swr/files";
import {
  useAddPodContextContentNodes,
  useDeletePodFile,
  useMovePodFile,
  usePodContextAttachments,
  usePodFiles,
  useRemovePodContextContentNodes,
} from "@app/lib/swr/pods";
import { useSpaceDataSourceViews, useSpaces } from "@app/lib/swr/spaces";
import { isManualPodFilesManagementAllowed } from "@app/lib/workspace_policies";
import type { ConnectorProvider } from "@app/types/data_source";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types/data_source_view";
import {
  getSupportedFileExtensions,
  isInteractiveContentType,
} from "@app/types/files";
import type { PodType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  ActionPushpinIcon,
  Button,
  CloudArrowLeftRightIcon,
  CloudArrowUpIcon,
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
  FolderIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const POD_FILE_MANAGEMENT_DISABLED_TOOLTIP =
  "Adding files to Pods is disabled by your workspace admin.";

interface AttachKnowledgeDropdownProps {
  buttonLabel: string;
  isDisabled: boolean;
  onCreateFolderClick: () => void;
  onUploadFileClick: () => void;
  onShowCompanyDataClick: () => void;
}

function AttachKnowledgeDropdown({
  buttonLabel,
  isDisabled,
  onCreateFolderClick,
  onUploadFileClick,
  onShowCompanyDataClick,
}: AttachKnowledgeDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          label={buttonLabel}
          isSelect
          variant="highlight"
          disabled={isDisabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem
          icon={CloudArrowLeftRightIcon}
          label="From Company Data"
          onClick={onShowCompanyDataClick}
        />
        <DropdownMenuItem
          icon={FolderIcon}
          label="New folder"
          onClick={onCreateFolderClick}
        />
        <DropdownMenuItem
          icon={CloudArrowUpIcon}
          label="Upload file"
          onClick={onUploadFileClick}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface AttachKnowledgeButtonProps extends AttachKnowledgeDropdownProps {
  canManuallyManagePodFiles: boolean;
}

function AttachKnowledgeButton({
  buttonLabel,
  canManuallyManagePodFiles,
  isDisabled,
  onCreateFolderClick,
  onShowCompanyDataClick,
  onUploadFileClick,
}: AttachKnowledgeButtonProps) {
  if (canManuallyManagePodFiles) {
    return (
      <AttachKnowledgeDropdown
        buttonLabel={buttonLabel}
        isDisabled={isDisabled}
        onCreateFolderClick={onCreateFolderClick}
        onShowCompanyDataClick={onShowCompanyDataClick}
        onUploadFileClick={onUploadFileClick}
      />
    );
  }
  return (
    <Tooltip
      label={POD_FILE_MANAGEMENT_DISABLED_TOOLTIP}
      trigger={
        <div>
          <AttachKnowledgeDropdown
            buttonLabel={buttonLabel}
            isDisabled={isDisabled}
            onCreateFolderClick={onCreateFolderClick}
            onShowCompanyDataClick={onShowCompanyDataClick}
            onUploadFileClick={onUploadFileClick}
          />
        </div>
      }
    />
  );
}

interface NoCompanyDataDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onGoToCompanyData: () => void;
}

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

interface PodFileExplorerProps {
  owner: WorkspaceType;
  pod: PodType;
}

export function PodFileExplorer({ owner, pod }: PodFileExplorerProps) {
  const isArchived = !!pod.archivedAt;

  if (isArchived) {
    return <PodFileExplorerContent owner={owner} pod={pod} />;
  }

  return (
    <FileDropProvider>
      <DropzoneContainer
        description="Drop files here to upload them."
        title="Upload files"
      >
        <PodFileExplorerContent owner={owner} pod={pod} />
      </DropzoneContainer>
    </FileDropProvider>
  );
}

function PodFileExplorerContent({ owner, pod }: PodFileExplorerProps) {
  const [framePreview, setFramePreview] = useState<{
    fileId: string;
    path: string;
    fileName: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentFolderPath, setCurrentFolderPath] = useState("");
  const [navigationResetKey, setNavigationResetKey] = useState(0);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [itemToRename, setItemToRename] = useState<
    | { kind: "file"; path: string; name: string }
    | { kind: "folder"; path: string; name: string }
    | null
  >(null);
  const [activeOverlay, setActiveOverlay] = useState<
    "companyData" | "noCompanyData" | null
  >(null);

  const podMountParentRelativePath = currentFolderPath;
  const isArchived = !!pod.archivedAt;
  const isEditor = pod.isEditor;
  const { togglePin, isPinned } = usePinPodBanner({
    owner,
    podId: pod.sId,
    pinnedFramePath: pod.pinnedFramePath ?? null,
    isEditor,
  });

  const getExtraFileMenuItems = useCallback(
    (entry: FileExplorerEntry): FileExplorerMenuAction[] => {
      if (
        !isEditor ||
        isArchived ||
        entry.kind !== "file" ||
        !isInteractiveContentType(entry.contentType)
      ) {
        return [];
      }

      const pinned = isPinned(entry.path);
      return [
        {
          label: pinned ? "Unpin from banner" : "Pin as Pod banner",
          icon: ActionPushpinIcon,
          onClick: (e) => {
            e.stopPropagation();
            void togglePin(entry.path, { fileName: entry.fileName });
          },
        },
      ];
    },
    [isArchived, isEditor, isPinned, togglePin]
  );

  const canManuallyManagePodKnowledge =
    isManualPodFilesManagementAllowed(owner);
  const confirm = useContext(ConfirmContext);

  const { spaces } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["global"],
  });
  const globalSpace = spaces.find((s) => s.kind === "global");

  const { spaceDataSourceViews: globalSpaceDSVs } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: globalSpace?.sId ?? "",
    disabled: !globalSpace,
  });

  const router = useAppRouter();

  const {
    attachments,
    isPodContextAttachmentsLoading,
    refreshPodContextAttachments,
  } = usePodContextAttachments({
    owner,
    podId: pod.sId,
  });

  const {
    files: podGCSFiles,
    isPodFilesLoading,
    refreshPodFiles,
  } = usePodFiles({
    owner,
    podId: pod.sId,
  });

  const refreshPodKnowledge = useCallback(async () => {
    await Promise.all([refreshPodFiles(), refreshPodContextAttachments()]);
  }, [refreshPodContextAttachments, refreshPodFiles]);

  const contentNodeAttachments = useMemo<ContentNodeAttachmentType[]>(
    () => attachments.filter(isContentNodeAttachmentType),
    [attachments]
  );

  const connectorProviderByDsvId = useMemo(() => {
    const map = new Map<string, ConnectorProvider | null>();
    for (const dsv of globalSpaceDSVs) {
      map.set(dsv.sId, dsv.dataSource.connectorProvider);
    }
    return map;
  }, [globalSpaceDSVs]);

  const contentNodeEntries = useMemo<ContentNodeEntry[]>(
    () =>
      contentNodeAttachments.map((a) => ({
        kind: "node" as const,
        fileName: a.title,
        path: `node/${a.nodeId}`,
        lastModifiedMs: a.lastUpdatedAt ?? null,
        sourceUrl: a.sourceUrl,
        nodeId: a.nodeId,
        nodeDataSourceViewId: a.nodeDataSourceViewId,
        connectorProvider:
          connectorProviderByDsvId.get(a.nodeDataSourceViewId) ?? null,
      })),
    [contentNodeAttachments, connectorProviderByDsvId]
  );

  const deletePodFile = useDeletePodFile({
    owner,
    podId: pod.sId,
  });

  const removePodContextContentNodes = useRemovePodContextContentNodes({
    owner,
    podId: pod.sId,
  });

  const addPodContextContentNodes = useAddPodContextContentNodes({
    owner,
    podId: pod.sId,
  });

  const podFileUpload = useFileUploaderService({
    hasSandboxTools: false,
    owner,
    useCase: "project_context",
    useCaseMetadata: {
      spaceId: pod.sId,
    },
  });

  const movePodFile = useMovePodFile({ owner });

  const uploadFilesToPod = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const uploadedBlobs = await podFileUpload.handleFilesUpload(files);
      if (!uploadedBlobs) {
        return;
      }

      if (podMountParentRelativePath) {
        for (const blob of uploadedBlobs) {
          if (!blob.path) {
            console.error(
              "File has no scoped mount path and cannot be moved within pod.",
              blob
            );
            continue;
          }
          const fileName = blob.path.split("/").pop() ?? blob.filename;
          const destCanonicalPath = `pod-${pod.sId}/${joinMountRelativePath(podMountParentRelativePath, fileName)}`;
          const moveResult = await movePodFile({
            srcCanonicalPath: blob.path,
            destCanonicalPath,
          });
          if (moveResult.isErr()) {
            console.error(
              "Failed to move file within pod.",
              moveResult.error,
              blob
            );
            break;
          }
        }
      }

      await refreshPodFiles();
    },
    [movePodFile, pod.sId, podMountParentRelativePath, podFileUpload, refreshPodFiles]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await uploadFilesToPod(files);
    },
    [uploadFilesToPod]
  );

  const { droppedFiles, setDroppedFiles } = useFileDrop();
  useEffect(() => {
    if (droppedFiles.length === 0) {
      return;
    }

    const files = [...droppedFiles];
    setDroppedFiles([]);
    void uploadFilesToPod(files);
  }, [droppedFiles, setDroppedFiles, uploadFilesToPod]);

  const onDelete = useCallback(
    async (entry: FileExplorerEntry) => {
      if (entry.kind === "node") {
        const confirmed = await confirm({
          title: "Remove content node?",
          message: `Are you sure you want to remove "${entry.fileName}" from this Pod?`,
          validateLabel: "Remove",
          validateVariant: "warning",
        });
        if (confirmed) {
          const result = await removePodContextContentNodes([
            {
              nodeId: entry.nodeId,
              nodeDataSourceViewId: entry.nodeDataSourceViewId,
            },
          ]);
          if (result.isOk()) {
            await refreshPodContextAttachments();
          }
        }
      } else if (entry.kind === "folder") {
        const confirmed = await confirm({
          title: "Delete folder?",
          message: `Are you sure you want to delete "${entry.name}" and all its contents? This action cannot be undone.`,
          validateLabel: "Delete",
          validateVariant: "warning",
        });
        if (confirmed) {
          // TODO: once FileSystemTreeNode carries the canonical scoped path, use entry.path directly.
          const result = await deletePodFile(`pod-${pod.sId}/${entry.path}`);
          if (result.isOk()) {
            await refreshPodFiles();
          }
        }
      } else {
        const confirmed = await confirm({
          title: "Delete file?",
          message: `Are you sure you want to delete "${entry.fileName}"? This action cannot be undone.`,
          validateLabel: "Delete",
          validateVariant: "warning",
        });
        if (confirmed) {
          const result = await deletePodFile(entry.path);
          if (result.isOk()) {
            await refreshPodFiles();
          }
        }
      }
    },
    [
      confirm,
      deletePodFile,
      refreshPodContextAttachments,
      refreshPodFiles,
      removePodContextContentNodes,
    ]
  );

  const onRename = useCallback(
    (entry: FileEntry | FolderEntry) => {
      if (entry.kind === "file") {
        setItemToRename({
          kind: "file",
          path: entry.path,
          name: entry.fileName,
        });
      } else {
        // TODO: once FileSystemTreeNode carries the canonical scoped path, use entry.path directly.
        setItemToRename({
          kind: "folder",
          path: `pod-${pod.sId}/${entry.path}`,
          name: entry.name,
        });
      }
      setShowRenameDialog(true);
    },
    [pod.sId]
  );

  const onMoveFile = useCallback(
    async (entry: FileEntry, parentRelativePath: string) => {
      // entry.path is the canonical scoped path, e.g. "pod-{sId}/subdir/file.txt".
      const destCanonicalPath = `pod-${pod.sId}/${joinMountRelativePath(parentRelativePath, entry.fileName)}`;
      const result = await movePodFile({
        srcCanonicalPath: entry.path,
        destCanonicalPath,
      });
      if (result.isOk()) {
        await refreshPodFiles();
      }
      return result;
    },
    [movePodFile, pod.sId, refreshPodFiles]
  );

  const getFileUrl = useCallback(
    (path: string) => {
      // path is the canonical scoped path, e.g. "pod-{sId}/subdir/file.txt".
      const encoded = path.split("/").map(encodeURIComponent).join("/");
      return `${config.getApiBaseUrl()}/api/w/${owner.sId}/files/path/${encoded}`;
    },
    [owner.sId]
  );

  const getFileResponse = useCallback(
    (path: string) => downloadFile(owner, path),
    [owner]
  );

  const onFileDownload = useFileDownload({ getFileResponse });

  const handleCloseOverlay = useCallback(() => {
    setActiveOverlay(null);
  }, []);

  const handleGoToCompanyData = useCallback(() => {
    if (!globalSpace) {
      return;
    }
    void router.push(`/w/${owner.sId}/spaces/${globalSpace.sId}`);
  }, [globalSpace, owner.sId, router]);

  const handleUploadFileClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCreateFolderClick = useCallback(() => {
    setShowCreateFolderDialog(true);
  }, []);

  const handleShowCompanyDataClick = useCallback(() => {
    setActiveOverlay(
      globalSpaceDSVs.length === 0 ? "noCompanyData" : "companyData"
    );
  }, [globalSpaceDSVs.length]);

  const isUploading = podFileUpload.isProcessingFiles;
  const uploadButtonLabel = isUploading ? "Uploading..." : "Add";
  const isAddKnowledgeDisabled = !canManuallyManagePodKnowledge || isUploading;

  const hasFiles = podGCSFiles.length > 0 || contentNodeEntries.length > 0;
  const isLoading = isPodContextAttachmentsLoading || isPodFilesLoading;

  const initialSelectedDataSources = useMemo<DataSourceViewType[]>(() => {
    const dsvById = new Map(globalSpaceDSVs.map((dsv) => [dsv.sId, dsv]));
    const nodeIdsByDataSourceViewId = new Map<string, string[]>();

    for (const a of contentNodeAttachments) {
      const existing =
        nodeIdsByDataSourceViewId.get(a.nodeDataSourceViewId) ?? [];
      nodeIdsByDataSourceViewId.set(a.nodeDataSourceViewId, [
        ...existing,
        a.nodeId,
      ]);
    }

    return Array.from(nodeIdsByDataSourceViewId.entries()).flatMap(
      ([dsvId, nodeIds]) => {
        const dsv = dsvById.get(dsvId);
        return dsv ? [{ ...dsv, parentsIn: nodeIds }] : [];
      }
    );
  }, [contentNodeAttachments, globalSpaceDSVs]);

  const handleCompanyDataSave = useCallback(
    async (
      selectionConfigurations: DataSourceViewSelectionConfigurations
    ): Promise<boolean> => {
      const selectedNodes = Object.values(selectionConfigurations).flatMap(
        ({ dataSourceView, selectedResources }) =>
          selectedResources.map((node) => ({
            title: node.title,
            nodeId: node.internalId,
            nodeDataSourceViewId: dataSourceView.sId,
            sourceUrl: node.sourceUrl,
          }))
      );

      const keyOf = (n: { nodeDataSourceViewId: string; nodeId: string }) =>
        `${n.nodeDataSourceViewId}:${n.nodeId}`;
      const currentKeys = new Set(contentNodeAttachments.map(keyOf));
      const selectedKeys = new Set(selectedNodes.map(keyOf));

      const toAdd = selectedNodes.filter((n) => !currentKeys.has(keyOf(n)));
      const toRemove = contentNodeAttachments.filter(
        (n) => !selectedKeys.has(keyOf(n))
      );

      if (toAdd.length > 0) {
        const addResult = await addPodContextContentNodes(
          toAdd.map((n) => ({
            title: n.title,
            nodeId: n.nodeId,
            nodeDataSourceViewId: n.nodeDataSourceViewId,
            ...(n.sourceUrl ? { url: n.sourceUrl } : {}),
          }))
        );
        if (addResult.isErr()) {
          return false;
        }
      }

      if (toRemove.length > 0) {
        const removeResult = await removePodContextContentNodes(
          toRemove.map((n) => ({
            nodeId: n.nodeId,
            nodeDataSourceViewId: n.nodeDataSourceViewId,
          }))
        );
        if (removeResult.isErr()) {
          return false;
        }
      }

      await refreshPodKnowledge();
      setNavigationResetKey((key) => key + 1);
      return true;
    },
    [
      addPodContextContentNodes,
      contentNodeAttachments,
      refreshPodKnowledge,
      removePodContextContentNodes,
    ]
  );

  const addButton = !isArchived ? (
    <AttachKnowledgeButton
      buttonLabel={uploadButtonLabel}
      canManuallyManagePodFiles={canManuallyManagePodKnowledge}
      isDisabled={isAddKnowledgeDisabled}
      onCreateFolderClick={handleCreateFolderClick}
      onShowCompanyDataClick={handleShowCompanyDataClick}
      onUploadFileClick={handleUploadFileClick}
    />
  ) : null;

  const emptyState = (
    <EmptyCTA
      message={
        isArchived
          ? "This Pod is archived. No files have been added."
          : "No files have been added to this Pod yet."
      }
      action={addButton}
    />
  );

  return (
    <>
      <PodFrameSheet
        owner={owner}
        fileId={framePreview?.fileId ?? null}
        framePath={framePreview?.path ?? null}
        fileName={framePreview?.fileName}
        podId={pod.sId}
        pinnedFramePath={pod.pinnedFramePath ?? null}
        isEditor={isEditor}
        isArchived={isArchived}
        isOpen={framePreview !== null}
        onClose={() => setFramePreview(null)}
      />

      <RenameFileDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onRenamed={() => void refreshPodFiles()}
        owner={owner}
        podId={pod.sId}
        item={itemToRename}
      />

      <CreateFolderDialog
        isOpen={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        onCreated={() => void refreshPodFiles()}
        owner={owner}
        parentRelativePath={podMountParentRelativePath}
        podId={pod.sId}
      />

      {globalSpace && (
        <SpaceManagedDatasourcesViewsModal
          isOpen={activeOverlay === "companyData"}
          isRootSelectable={false}
          onClose={handleCloseOverlay}
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
        isOpen={activeOverlay === "noCompanyData"}
        onClose={handleCloseOverlay}
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

      <FileExplorer
        contentClassName="max-w-4xl mx-auto w-full"
        contentNodes={contentNodeEntries}
        defaultViewMode="list"
        emptyState={hasFiles ? undefined : emptyState}
        files={podGCSFiles}
        getFileUrl={getFileUrl}
        hideTitleBorder
        navigationResetKey={navigationResetKey}
        onCurrentFolderChange={setCurrentFolderPath}
        onFileDownload={onFileDownload}
        onDelete={!isArchived ? onDelete : undefined}
        onMoveFile={!isArchived ? onMoveFile : undefined}
        onRename={!isArchived ? onRename : undefined}
        onOpenInteractive={(entry) => {
          if (entry.fileId) {
            setFramePreview({
              fileId: entry.fileId,
              path: entry.path,
              fileName: entry.fileName,
            });
          }
        }}
        getExtraFileMenuItems={getExtraFileMenuItems}
        toolbarExtraActions={addButton}
        isLoading={isLoading}
      />
    </>
  );
}
