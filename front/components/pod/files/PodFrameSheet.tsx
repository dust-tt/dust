import { AuthenticatedVisualizationActionIframe } from "@app/components/assistant/conversation/actions/AuthenticatedVisualizationActionIframe";
import { ExportContentDropdown } from "@app/components/assistant/conversation/interactive_content/ExportContentDropdown";
import { ShareFrameSheet } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSheet";
import { PinPodBannerButton } from "@app/components/pod/files/PinPodBannerButton";
import { PodFileTabButton } from "@app/components/pod/files/PodFileTabButton";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useFileContent, useFileMetadata } from "@app/lib/swr/files";
import { getFrameFunctionReferenceKind } from "@app/types/api/frame_function_reference";
import type { PodFileTab } from "@app/types/pod_file_tab";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  Maximize01,
  Minimize01,
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  XClose,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

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

export function PodFrameSheet({
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
}: PodFrameSheetProps) {
  const { vizUrl } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const hasFileTabs = hasFeature("pod_frame_tabs");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const { fileContent } = useFileContent({
    fileId,
    owner,
    config: { disabled: !isOpen || !fileId },
  });

  const { fileMetadata, isFileMetadataLoading, isFileMetadataError } =
    useFileMetadata({
      fileId,
      owner,
      disabled: !isOpen || !fileId,
    });
  const functionReferenceKind = getFrameFunctionReferenceKind(
    fileMetadata?.contentType
  );

  useEffect(() => {
    if (!isOpen) {
      setIsFullscreen(false);
    }
  }, [isOpen]);

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
              {fileMetadata?.fileName}
            </SheetTitle>
            {fileId && (
              <div className="flex max-w-[60%] shrink-0 items-center justify-end gap-1 overflow-x-auto">
                <ExportContentDropdown
                  iframeRef={iframeRef}
                  owner={owner}
                  fileId={fileId}
                  fileContent={fileContent ?? null}
                  fileName={fileMetadata?.fileName}
                />
                <ShareFrameSheet fileId={fileId} owner={owner} />
                <PinPodBannerButton
                  owner={owner}
                  spaceId={podId}
                  pinnedFramePath={pinnedFramePath}
                  isEditor={isEditor}
                  framePath={framePath}
                  fileName={fileName}
                  hidden={isArchived}
                />
                {hasFileTabs && (
                  <PodFileTabButton
                    owner={owner}
                    spaceId={podId}
                    fileTabs={fileTabs}
                    tabsOrder={tabsOrder}
                    isEditor={isEditor}
                    filePath={framePath}
                    fileName={fileName}
                    hidden={isArchived}
                  />
                )}
                <Button
                  icon={isFullscreen ? Minimize01 : Maximize01}
                  variant="ghost"
                  size="sm"
                  tooltip={
                    isFullscreen ? "Exit full screen" : "Open in full screen"
                  }
                  onClick={() => setIsFullscreen((prev) => !prev)}
                />
              </div>
            )}
            <SheetClose asChild>
              <Button icon={XClose} variant="ghost" size="sm" />
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {isFileMetadataLoading ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : isFileMetadataError || !fileMetadata || !functionReferenceKind ? (
            <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
              This frame is no longer available in the Pod files.
            </div>
          ) : !fileContent ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            fileId &&
            vizUrl && (
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
                key={`viz-${fileId}`}
                conversationId={null}
                spaceId={fileMetadata?.useCaseMetadata.spaceId}
                framePath={framePath}
                frameId={functionReferenceKind === "v2" ? fileId : undefined}
                isInDrawer={true}
                isPodEditor={isEditor}
                isPodMember={isMember}
                ref={iframeRef}
              />
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
