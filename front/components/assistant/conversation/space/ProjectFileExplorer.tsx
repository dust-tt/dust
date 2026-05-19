import {
  FileDropProvider,
  useFileDrop,
} from "@app/components/assistant/conversation/FileUploaderContext";
import { RenameFileDialog } from "@app/components/assistant/conversation/space/RenameFileDialog";
import { ConfirmContext } from "@app/components/Confirm";
import { FileExplorer } from "@app/components/file_explorer/FileExplorer";
import type {
  ContentNodeEntry,
  FileEntry,
  FileExplorerEntry,
} from "@app/components/file_explorer/types";
import { useFileDownload } from "@app/components/file_explorer/useFileDownload";
import { DropzoneContainer } from "@app/components/misc/DropzoneContainer";
import SpaceManagedDatasourcesViewsModal from "@app/components/spaces/SpaceManagedDatasourcesViewsModal";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import type { ContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { isContentNodeAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import config from "@app/lib/api/config";
import { useAppRouter } from "@app/lib/platform";
import { downloadPodFile } from "@app/lib/swr/files";
import {
  useAddProjectContextContentNodes,
  useDeleteProjectFile,
  useProjectContextAttachments,
  useProjectFiles,
  useRemoveProjectContextContentNodes,
} from "@app/lib/swr/projects";
import { useSpaceDataSourceViews, useSpaces } from "@app/lib/swr/spaces";
import { isManualProjectKnowledgeManagementAllowed } from "@app/lib/workspace_policies";
import type { ConnectorProvider } from "@app/types/data_source";
import type {
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
} from "@app/types/data_source_view";
import { getSupportedFileExtensions } from "@app/types/files";
import type { ProjectType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
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
  PlusIcon,
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
  "Adding files to projects is disabled by your workspace admin.";

interface AttachKnowledgeDropdownProps {
  buttonLabel: string;
  isDisabled: boolean;
  onUploadFileClick: () => void;
  onShowCompanyDataClick: () => void;
}

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
          icon={CloudArrowLeftRightIcon}
          label="From Company Data"
          onClick={onShowCompanyDataClick}
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
  space: ProjectType;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [fileToRename, setFileToRename] = useState<{
    path: string;
    fileName: string;
  } | null>(null);
  const [activeOverlay, setActiveOverlay] = useState<
    "companyData" | "noCompanyData" | null
  >(null);
  const isArchived = !!space.archivedAt;
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

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      await projectFileUpload.handleFileChange(e);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      void mutateProjectFiles();
    },
    [projectFileUpload, mutateProjectFiles]
  );

  const handleDroppedFiles = useCallback(
    async (files: File[]) => {
      await projectFileUpload.handleFilesUpload(files);
      void mutateProjectFiles();
    },
    [projectFileUpload, mutateProjectFiles]
  );

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

  const onDelete = useCallback(
    async (entry: FileExplorerEntry) => {
      if (entry.kind === "node") {
        const confirmed = await confirm({
          title: "Remove content node?",
          message: `Are you sure you want to remove "${entry.fileName}" from this project?`,
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
            void mutateProjectContextAttachments();
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
            void mutateProjectFiles();
          }
        }
      }
    },
    [
      confirm,
      deleteProjectFile,
      mutateProjectContextAttachments,
      mutateProjectFiles,
      removeProjectContextContentNodes,
    ]
  );

  const onRename = useCallback((entry: FileEntry) => {
    setFileToRename({ path: entry.path, fileName: entry.fileName });
    setShowRenameDialog(true);
  }, []);

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

  const handleShowCompanyDataClick = useCallback(() => {
    setActiveOverlay(
      globalSpaceDSVs.length === 0 ? "noCompanyData" : "companyData"
    );
  }, [globalSpaceDSVs.length]);

  const isUploading = projectFileUpload.isProcessingFiles;
  const uploadButtonLabel = isUploading ? "Uploading..." : "Add";
  const isAddKnowledgeDisabled =
    !canManuallyManageProjectKnowledge || isUploading;

  const hasFiles =
    projectGCSFiles.some((f) => !f.isDirectory) ||
    contentNodeEntries.length > 0;
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
    async (selectionConfigurations: DataSourceViewSelectionConfigurations) => {
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

      void mutateProjectContextAttachments();
    },
    [
      addProjectContextContentNodes,
      contentNodeAttachments,
      mutateProjectContextAttachments,
      removeProjectContextContentNodes,
    ]
  );

  const addButton = !isArchived ? (
    <AttachKnowledgeButton
      buttonLabel={uploadButtonLabel}
      canManuallyManageProjectKnowledge={canManuallyManageProjectKnowledge}
      isDisabled={isAddKnowledgeDisabled}
      onShowCompanyDataClick={handleShowCompanyDataClick}
      onUploadFileClick={handleUploadFileClick}
    />
  ) : null;

  const emptyState = (
    <EmptyCTA
      message={
        isArchived
          ? "This project is archived. No files have been added."
          : "No files have been added to this project yet."
      }
      action={addButton}
    />
  );

  return (
    <>
      <RenameFileDialog
        isOpen={showRenameDialog}
        onClose={() => setShowRenameDialog(false)}
        onRenamed={() => void mutateProjectFiles()}
        owner={owner}
        spaceId={space.sId}
        file={fileToRename}
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
        onFileDownload={onFileDownload}
        onDelete={!isArchived ? onDelete : undefined}
        onRename={!isArchived ? onRename : undefined}
        headerActions={addButton}
        isLoading={isLoading}
      />
    </>
  );
}
