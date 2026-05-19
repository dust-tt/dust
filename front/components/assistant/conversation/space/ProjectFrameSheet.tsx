import { VisualizationActionIframe } from "@app/components/assistant/conversation/actions/VisualizationActionIframe";
import { ExportContentDropdown } from "@app/components/assistant/conversation/interactive_content/ExportContentDropdown";
import { ShareFrameSheet } from "@app/components/assistant/conversation/interactive_content/frame/ShareFrameSheet";
import { useAuth } from "@app/lib/auth/AuthContext";
import { useFileContent, useFileMetadata } from "@app/lib/swr/files";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useRef } from "react";

interface ProjectFrameSheetProps {
  fileId: string | null;
  isOpen: boolean;
  onClose: () => void;
  owner: WorkspaceType;
}

export function ProjectFrameSheet({
  fileId,
  isOpen,
  onClose,
  owner,
}: ProjectFrameSheetProps) {
  const { vizUrl } = useAuth();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { fileContent } = useFileContent({
    fileId,
    owner,
    config: { disabled: !isOpen || !fileId },
  });

  const { fileMetadata, isFileMetadataLoading } = useFileMetadata({
    fileId,
    owner,
  });

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="xl">
        <SheetHeader hideButton>
          <div className="flex items-center gap-2">
            <SheetTitle className="flex-1 truncate">
              {fileMetadata?.fileName}
            </SheetTitle>
            {fileId && (
              <div className="flex shrink-0 items-center gap-1">
                <ExportContentDropdown
                  iframeRef={iframeRef}
                  owner={owner}
                  fileId={fileId}
                  fileContent={fileContent ?? null}
                  fileName={fileMetadata?.fileName}
                />
                <ShareFrameSheet fileId={fileId} owner={owner} />
              </div>
            )}
            <SheetClose asChild>
              <Button icon={XMarkIcon} variant="ghost" size="sm" />
            </SheetClose>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-hidden">
          {isFileMetadataLoading || !fileContent ? (
            <div className="flex h-full items-center justify-center">
              <Spinner />
            </div>
          ) : (
            fileId &&
            vizUrl && (
              <VisualizationActionIframe
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
                spaceId={fileMetadata?.useCaseMetadata.spaceId ?? null}
                isInDrawer={true}
                ref={iframeRef}
              />
            )
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
