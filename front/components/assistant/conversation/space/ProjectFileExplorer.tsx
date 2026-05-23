import {
  FileDropProvider,
  useFileDrop,
} from "@app/components/assistant/conversation/FileUploaderContext";
import { CreateFolderDialog } from "@app/components/assistant/conversation/space/CreateFolderDialog";
import { ProjectFrameSheet } from "@app/components/assistant/conversation/space/ProjectFrameSheet";
import { RenameFileDialog } from "@app/components/assistant/conversation/space/RenameFileDialog";
import { ConfirmContext } from "@app/components/Confirm";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerEntry,
  FileExplorerMenuAction,
} from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import {
  getScopedRelativePath,
  joinMountRelativePath,
} from "@app/components/file_explorer/utils";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import SpaceManagedDatasourcesViewsModal from "@app/components/spaces/SpaceManagedDatasourcesViewsModal";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { usePinPodBanner } from "@app/hooks/usePinPodBanner";
import type { ContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import config from "@app/lib/api/config";
import { useAppRouter } from "@app/lib/platform";
import { downloadPodFile } from "@app/lib/swr/files";
import { useMoveMountFile } from "@app/lib/swr/mount_files";
import {
  useAddProjectContextContentNodes,
  useDeleteProjectFile,
  useProjectContextAttachments,
  useProjectFiles,
  useRemoveProjectContextContentNodes,
} from "@app/lib/swr/projects";
import { useSpaceDataSourceViews, useSpaces } from "@app/lib/swr/spaces";
import { isManualProjectKnowledgeManagementAllowed } from "@app/lib/workspace_policies";
import type { RichSpaceType } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { ConnectorProvider } from "@app/types/data_source";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types/data_source_view";
import {
  getSupportedFileExtensions,
  isInteractiveContentType,
} from "@app/types/files";
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

const PROJECT_KNOWLEDGE_MANAGEMENT_DISABLED_TOOLTIP =
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
  canManuallyManageProjectKnowledge: boolean;
}

function AttachKnowledgeButton({
  buttonLabel,
  canManuallyManageProjectKnowledge,
  isDisabled,
  onCreateFolderClick,
  onShowCompanyDataClick,
  onUploadFileClick,
}: AttachKnowledgeButtonProps) {
  if (canManuallyManageProjectKnowledge) {
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
      label={PROJECT_KNOWLEDGE_MANAGEMENT_DISABLED_TOOLTIP}
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

interface ProjectFileExplorerProps {
  owner: WorkspaceType;
  space: RichSpaceType;
}

export function ProjectFileExplorer({
  owner,
  space,
}: ProjectFileExplorerProps) {
  const isArchived = !!space.archivedAt;

  if (isArchived) {
    return <ProjectFileExplorerContent owner={owner} space={space} />;
  }

  return (
    <FileDropProvider>
      <DropzoneContainer
        description="Drop files here to upload them."
        title="Upload files"
      >
        <ProjectFileExplorerContent owner={owner} space={space} />
      </DropzoneContainer>
    </FileDropProvider>
  );
}

function ProjectFileExplorerContent({
  owner,
  space,
}: ProjectFileExplorerProps) {
  const [frameFileId, setFrameFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentFolderPath, setCurrentFolderPath] = useState("");
  const [navigationResetKey, setNavigationResetKey] = useState(0);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [fileToRename, setFileToRename] = useState<{
    path: string;
    fileName: string;
  } | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<
    "companyData" | "noCompanyData" | null
  >(null);

  const podMountParentRelativePath = currentFolderPath;
  const isArchived = !!space.archivedAt;
  const isEditor = space.isEditor;
  const { togglePin, isPinned } = usePinPodBanner({
    owner,
    spaceId: space.sId,
    pinnedFramePath: space.pinnedFramePath ?? null,
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

  const canManuallyManageProjectKnowledge =
    isManualProjectKnowledgeManagementAllowed(owner);
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
    attachments: contextAttachments,
    isProjectContextAttachmentsLoading,
    refreshProjectContextAttachments,
  } = useProjectContextAttachments({
    owner,
    spaceId: space.sId,
  });

  const {
    files: projectGCSFiles,
    isProjectFilesLoading,
    refreshProjectFiles,
  } = useProjectFiles({
    owner,
    spaceId: space.sId,
  });

  const refreshProjectKnowledge = useCallback(async () => {
    await Promise.all([
      refreshProjectFiles(),
      refreshProjectContextAttachments(),
    ]);
  }, [refreshProjectContextAttachments, refreshProjectFiles]);

  const contentNodeAttachments = useMemo<ContentNodeAttachmentType[]>(
    () => contextAttachments.filter(isContentNodeAttachmentType),
    [contextAttachments]
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

  const deleteProjectFile = useDeleteProjectFile({
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

  const moveMountFile = useMoveMountFile({
    filesApiBasePath: `/api/w/${owner.sId}/spaces/${space.sId}/files`,
  });

  const uploadFilesToProject = useCallback(
    async (files: File[]) => {
      if (files.length === 0) {
        return;
      }

      const uploadedBlobs = await projectFileUpload.handleFilesUpload(files);
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
          const moveResult = await moveMountFile({
            relativeFilePath: getScopedRelativePath(blob.path),
            destRelativeFilePath: joinMountRelativePath(
              podMountParentRelativePath,
              fileName
            ),
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

      await refreshProjectFiles();
    },
    [
      moveMountFile,
      podMountParentRelativePath,
      projectFileUpload,
      refreshProjectFiles,
    ]
  );

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await uploadFilesToProject(files);
    },
    [uploadFilesToProject]
  );

  const { droppedFiles, setDroppedFiles } = useFileDrop();
  useEffect(() => {
    if (droppedFiles.length === 0) {
      return;
    }

    const files = [...droppedFiles];
    setDroppedFiles([]);
    void uploadFilesToProject(files);
  }, [droppedFiles, setDroppedFiles, uploadFilesToProject]);

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
          const result = await removeProjectContextContentNodes([
            {
              nodeId: entry.nodeId,
              nodeDataSourceViewId: entry.nodeDataSourceViewId,
            },
          ]);
          if (result.isOk()) {
            await refreshProjectContextAttachments();
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
          const result = await deleteProjectFile(entry.path);
          if (result.isOk()) {
            await refreshProjectFiles();
          }
        }
      }
    },
    [
      confirm,
      deleteProjectFile,
      refreshProjectContextAttachments,
      refreshProjectFiles,
      removeProjectContextContentNodes,
    ]
  );

  const onRename = useCallback((entry: FileEntry) => {
    setFileToRename({ path: entry.path, fileName: entry.fileName });
    setShowRenameDialog(true);
  }, []);

  const onMoveFile = useCallback(
    async (entry: FileEntry, parentRelativePath: string) => {
      const result = await moveMountFile({
        relativeFilePath: getScopedRelativePath(entry.path),
        destRelativeFilePath: joinMountRelativePath(
          parentRelativePath,
          entry.fileName
        ),
      });
      if (result.isOk()) {
        await refreshProjectFiles();
      }
      return result;
    },
    [moveMountFile, refreshProjectFiles]
  );

  const getFileUrl = useCallback(
    (path: string) =>
      `${config.getApiBaseUrl()}/api/w/${owner.sId}/spaces/${space.sId}/files/${path}`,
    [owner.sId, space.sId]
  );

  const getFileResponse = useCallback(
    (path: string) => downloadPodFile(owner, space.sId, path),
    [owner, space.sId]
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

  const isUploading = projectFileUpload.isProcessingFiles;
  const uploadButtonLabel = isUploading ? "Uploading..." : "Add";
  const isAddKnowledgeDisabled =
    !canManuallyManageProjectKnowledge || isUploading;

  const hasFiles = projectGCSFiles.length > 0 || contentNodeEntries.length > 0;
  const isLoading = isProjectContextAttachmentsLoading || isProjectFilesLoading;

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
        const addResult = await addProjectContextContentNodes(
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
        const removeResult = await removeProjectContextContentNodes(
          toRemove.map((n) => ({
            nodeId: n.nodeId,
            nodeDataSourceViewId: n.nodeDataSourceViewId,
          }))
        );
        if (removeResult.isErr()) {
          return false;
        }
      }

      await refreshProjectKnowledge();
      setNavigationResetKey((key) => key + 1);
      return true;
    },
    [
      addProjectContextContentNodes,
      contentNodeAttachments,
      refreshProjectKnowledge,
      removeProjectContextContentNodes,
    ]
  );

  const addButton = !isArchived ? (
    <AttachKnowledgeButton
      buttonLabel={uploadButtonLabel}
      canManuallyManageProjectKnowledge={canManuallyManageProjectKnowledge}
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
      <ProjectFrameSheet
        owner={owner}
        fileId={frameFileId}
        isOpen={frameFileId !== null}
        onClose={() => setFrameFileId(null)}
      />

      <RenameFileDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onRenamed={() => void refreshProjectFiles()}
        owner={owner}
        spaceId={space.sId}
        file={fileToRename}
      />

      <CreateFolderDialog
        isOpen={showCreateFolderDialog}
        onClose={() => setShowCreateFolderDialog(false)}
        onCreated={() => void refreshProjectFiles()}
        owner={owner}
        parentRelativePath={podMountParentRelativePath}
        spaceId={space.sId}
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
        files={projectGCSFiles}
        getFileUrl={getFileUrl}
        hideTitleBorder
        navigationResetKey={navigationResetKey}
        onCurrentFolderChange={setCurrentFolderPath}
        onFileDownload={onFileDownload}
        onDelete={!isArchived ? onDelete : undefined}
        onMoveFile={!isArchived ? onMoveFile : undefined}
        onRename={!isArchived ? onRename : undefined}
        onOpenInteractive={(entry) => setFrameFileId(entry.fileId)}
        getExtraFileMenuItems={getExtraFileMenuItems}
        toolbarExtraActions={addButton}
        isLoading={isLoading}
      />
    </>
  );
}
