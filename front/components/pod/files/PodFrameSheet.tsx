import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { FrameCodeView } from "@app/components/assistant/conversation/interactive_content/frame/FrameCodeView";
import { FrameToolbar } from "@app/components/assistant/conversation/interactive_content/frame/FrameToolbar";
import { FrameToolConsentGate } from "@app/components/assistant/conversation/interactive_content/frame/FrameToolConsentGate";
import { PreviewActionButtons } from "@app/components/assistant/conversation/interactive_content/frame/PreviewActionButtons";
import { useFrameEditSession } from "@app/components/assistant/conversation/interactive_content/frame/useFrameEditSession";
import { useAuth } from "@app/lib/auth/AuthContext";
import {
  useFileContent,
  useFileContentByUrl,
  useFileMetadata,
  useShareInteractiveContentFile,
} from "@app/lib/swr/files";
import { useFramePermissions } from "@app/lib/swr/frames";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
import { getFrameV2NameFromManifestPath } from "@app/types/api/frame_manifest";
import { getFileDisplayName } from "@app/types/files";
import type { PodFileTab } from "@app/types/pod_file_tab";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  XClose,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useRef, useState } from "react";

interface PodFrameSheetProps {
  fileId: string | null;
  framePath: string | null;
  fileName?: string;
  podId: string;
  pinnedFramePath: string | null;
  fileTabs: PodFileTab[];
  tabsOrder?: string[];
  isEditor: boolean;
  isMember: boolean;
  isArchived: boolean;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}

/**
 * Sheet stays mounted across opens; when a Frame is selected the body is keyed by
 * `fileId` so the Frames v2 edit session resets when switching Frames (same idea as
 * the conversation side panel).
 */
export function PodFrameSheet({
  fileId,
  isOpen,
  onClose,
  ...bodyProps
}: PodFrameSheetProps) {
  if (!fileId) {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent size="xl" />
      </Sheet>
    );
  }

  return (
    <PodFrameSheetWithFile
      key={fileId}
      fileId={fileId}
      isOpen={isOpen}
      onClose={onClose}
      {...bodyProps}
    />
  );
}

type PodFrameSheetWithFileProps = Omit<PodFrameSheetProps, "fileId"> & {
  fileId: string;
};

function PodFrameSheetWithFile({
  fileId,
  framePath,
  fileName,
  podId,
  pinnedFramePath,
  fileTabs,
  tabsOrder,
  isEditor,
  isMember,
  isArchived,
  isOpen,
  onClose,
  owner,
}: PodFrameSheetWithFileProps) {
  const { t } = useLingui();
  const { vizUrl } = useAuth();
  const isMobile = useIsMobile();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const { fileContent, mutateFileContent } = useFileContent({
    fileId,
    owner,
    config: { disabled: !isOpen },
  });

  // A Frames v2 package is named by the folder holding its manifest, which is the path this
  // sheet is opened with. Legacy Frames have no manifest and fall back to their file name.
  const frameName = framePath
    ? getFrameV2NameFromManifestPath(framePath)
    : null;

  const { fileMetadata, isFileMetadataLoading, isFileMetadataError } =
    useFileMetadata({
      fileId,
      owner,
      disabled: !isOpen,
    });
  const functionReferenceKind = getFrameFunctionReferenceKind(
    fileMetadata?.contentType
  );
  const isV2 = functionReferenceKind === "v2";

  const {
    canWriteFrameSource,
    hasFrameFunctions,
    requiredTools,
    hasAuthorizedRequiredTools,
    isFramePermissionsLoading,
    mutateFramePermissions,
  } = useFramePermissions({
    owner,
    frameId: fileId,
    disabled: !isOpen || !isV2,
  });
  const needsToolConsent =
    isV2 && !isFramePermissionsLoading && !hasAuthorizedRequiredTools;

  const { fileShare } = useShareInteractiveContentFile({
    fileId,
    owner,
    disabled: !isOpen,
  });

  const frameSourceBaseUrl = `/api/w/${owner.sId}/frames/${encodeURIComponent(fileId)}/source`;
  const {
    fileContent: frameSource,
    isNotFound: isFrameSourceNotFound,
    isFileContentLoading: isFrameSourceLoading,
    fileContentError: frameSourceError,
  } = useFileContentByUrl({
    url: frameSourceBaseUrl,
    disabled: !isOpen || !isV2 || !showCode,
  });

  // Pod sheet only offers the Frames v2 Preview|Edit session; legacy Frames stay view-only here.
  const canEditV2 = isV2 && canWriteFrameSource;
  const isEditable = canEditV2;
  const editSession = useFrameEditSession({
    owner,
    fileId,
    conversationId: undefined,
    iframeRef,
    mutateFileContent,
  });

  const framePackageRoot =
    framePath && framePath.includes("/")
      ? framePath.slice(0, framePath.lastIndexOf("/"))
      : null;

  const vizInstanceKey = `viz-${fileId}${
    isV2 ? `-${editSession.contentRevision}` : ""
  }`;

  const [isReloading, setIsReloading] = useState(false);
  const reloadFile = useCallback(async () => {
    setIsReloading(true);
    try {
      await mutateFileContent(
        `/api/w/${owner.sId}/files/${fileId}?action=view`
      );
      if (isV2) {
        editSession.remount();
      }
    } finally {
      setIsReloading(false);
    }
  }, [editSession, fileId, isV2, mutateFileContent, owner.sId]);

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
      setShowCode(false);
    }
  }, [isOpen]);

  const showPreviewActions =
    !(isV2 && isFramePermissionsLoading) && !needsToolConsent && !isReloading;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        size="xl"
        className={cn(isFullscreen && "inset-0 sm:max-w-none")}
        onEscapeKeyDown={(e) => {
          if (isFullscreen) {
            e.preventDefault();
            setIsFullscreen(false);
          }
        }}
      >
        <SheetHeader hideButton>
          <div className="flex min-w-0 items-center gap-2">
            <SheetTitle className="min-w-0 flex-1 truncate">
              {fileMetadata && (frameName ?? getFileDisplayName(fileMetadata))}
            </SheetTitle>
            <div className="flex w-full max-w-[70%] shrink-0 items-center justify-end overflow-x-auto">
              <FrameToolbar
                layout="end"
                owner={owner}
                fileId={fileId}
                iframeRef={iframeRef}
                fileContent={fileContent ?? null}
                fileName={fileMetadata?.fileName}
                contentType={fileMetadata?.contentType}
                showCode={showCode}
                onToggleCode={
                  !isV2 || canWriteFrameSource
                    ? () => setShowCode(!showCode)
                    : undefined
                }
                hasFrameFunctions={hasFrameFunctions}
                editSession={editSession}
                canEditV2={canEditV2}
                hideEditLabels={isMobile}
                podActions={{
                  spaceId: podId,
                  pinnedFramePath,
                  isEditor,
                  framePath,
                  fileName,
                  fileTabs,
                  tabsOrder,
                  hidden: isArchived,
                }}
              />
            </div>
            <SheetClose asChild>
              <Button
                aria-label={t`Close`}
                icon={XClose}
                variant="ghost"
                size="sm"
              />
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="relative flex-1 overflow-hidden">
          {isFileMetadataLoading ||
          isReloading ||
          (isV2 && isFramePermissionsLoading) ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : isFileMetadataError || !fileMetadata || !functionReferenceKind ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              <Trans>
                This frame is no longer available in the Pod files.
              </Trans>
            </div>
          ) : !fileContent ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : needsToolConsent ? (
            <FrameToolConsentGate
              owner={owner}
              frameId={fileId}
              requiredTools={requiredTools}
              onAuthorized={async () => {
                await mutateFramePermissions();
              }}
            />
          ) : (
            <>
              {showCode ? (
                <FrameCodeView
                  code={isV2 ? (frameSource ?? undefined) : fileContent}
                  isLoading={isV2 && isFrameSourceLoading}
                  hasError={
                    isV2 && (isFrameSourceNotFound || Boolean(frameSourceError))
                  }
                />
              ) : (
                vizUrl && (
                  <div className="relative h-full">
                    <AuthenticatedVisualizationActionIframe
                      agentConfigurationId={
                        fileMetadata?.useCaseMetadata
                          .lastEditedByAgentConfigurationId ?? null
                      }
                      workspaceId={owner.sId}
                      vizUrl={vizUrl}
                      visualization={{
                        code: fileContent,
                        complete: true,
                        identifier: `viz-${fileId}`,
                      }}
                      key={vizInstanceKey}
                      conversationId={null}
                      spaceId={fileMetadata?.useCaseMetadata.spaceId}
                      framePackageRoot={framePackageRoot}
                      frameId={isV2 ? fileId : undefined}
                      isInDrawer={true}
                      isEditable={isEditable}
                      stagedEditMode={canEditV2 ? editSession.mode : undefined}
                      onEditText={
                        !isEditable
                          ? undefined
                          : canEditV2
                            ? editSession.stageEdit
                            : undefined
                      }
                      isPodEditor={isEditor}
                      isPodMember={isMember}
                      ref={iframeRef}
                    />
                    {editSession.isSaving && (
                      <div
                        className="absolute inset-0 z-10 cursor-wait"
                        aria-busy="true"
                        aria-label={t`Publishing your changes...`}
                      />
                    )}
                  </div>
                )
              )}
              {showPreviewActions && (
                <PreviewActionButtons
                  isFullScreen={isFullscreen}
                  enterFullScreen={() => setIsFullscreen(true)}
                  exitFullScreen={() => setIsFullscreen(false)}
                  shareUrl={fileShare?.shareUrl}
                  reloadFile={() => {
                    void reloadFile();
                  }}
                />
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
