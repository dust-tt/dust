import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FilesTab } from "@app/components/assistant/conversation/files_panel/FilesTab";
import { SandboxStatusChip } from "@app/components/assistant/conversation/files_panel/SandboxStatusChip";
import { SandboxTab } from "@app/components/assistant/conversation/files_panel/SandboxTab";
import type { ConversationAttachmentItem } from "@app/components/assistant/conversation/files_panel/types";
import { conversationAttachmentToRow } from "@app/components/assistant/conversation/files_panel/utils";
import {
  FilePreviewSheet,
  type MinimalFileForPreview,
} from "@app/components/spaces/FilePreviewSheet";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { useConversationSandboxStatus } from "@app/hooks/conversations/useConversationSandboxStatus";
import { useSendNotification } from "@app/hooks/useNotification";
import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { downloadSandboxFile } from "@app/lib/swr/files";
import type { GCSMountFileEntry } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isInteractiveContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useRef, useState } from "react";

interface ConversationFilesPanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationFilesPanel({
  conversation,
  owner,
}: ConversationFilesPanelProps) {
  const [activeTab, setActiveTab] = useState("files");
  const [previewFile, setPreviewFile] = useState<MinimalFileForPreview | null>(
    null
  );
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const isDownloadingRef = useRef(false);
  const blobUrlRef = useRef<string | null>(null);
  const { openPanel, closePanel } = useConversationSidePanelContext();
  const sendNotification = useSendNotification();

  const { attachments, isConversationAttachmentsLoading } =
    useConversationAttachments({
      conversationId: conversation.sId,
      owner,
    });

  const { sandboxStatus } = useConversationSandboxStatus({
    conversationId: conversation.sId,
    owner,
  });

  const openFile = useCallback(
    ({
      fileId,
      title,
      contentType,
    }: {
      fileId: string;
      title: string;
      contentType: string;
    }) => {
      if (isInteractiveContentType(contentType)) {
        openPanel({ type: "interactive_content", fileId });
      } else {
        setPreviewFile({ sId: fileId, fileName: title, contentType });
        setShowPreviewSheet(true);
      }
    },
    [openPanel]
  );

  const handleAttachmentClick = useCallback(
    (item: ConversationAttachmentItem) => {
      if (isFileAttachmentType(item)) {
        openFile(item);
      }
    },
    [openFile]
  );

  const handleSandboxFileClick = useCallback(
    async (entry: GCSMountFileEntry) => {
      if (entry.fileId) {
        openFile({
          fileId: entry.fileId,
          title: entry.fileName,
          contentType: entry.contentType,
        });
        return;
      }

      if (isDownloadingRef.current) {
        return;
      }

      // File only exists in GCS — download via POST and open as blob URL.
      isDownloadingRef.current = true;
      try {
        const res = await downloadSandboxFile(
          owner,
          conversation.sId,
          entry.path
        );
        const blob = await res.blob();
        if (blobUrlRef.current) {
          URL.revokeObjectURL(blobUrlRef.current);
        }
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;

        const a = document.createElement("a");
        a.href = url;
        a.download = entry.fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to download the file.",
          description: "An error occurred while downloading. Please try again.",
        });
      } finally {
        isDownloadingRef.current = false;
      }
    },
    [openFile, owner, conversation.sId, sendNotification]
  );

  const fileRows = useMemo(
    () =>
      attachments.map((a) =>
        conversationAttachmentToRow(a, handleAttachmentClick)
      ),
    [attachments, handleAttachmentClick]
  );

  const hasSandbox = sandboxStatus !== null;

  const filesContent = (
    <FilesTab
      isLoading={isConversationAttachmentsLoading}
      owner={owner}
      rows={fileRows}
    />
  );

  if (!hasSandbox) {
    return (
      <>
        <div className="flex h-full flex-col">
          <AppLayoutTitle>
            <div className="flex h-full items-center justify-between">
              <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
                Working Files
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={closePanel}
                icon={XMarkIcon}
              />
            </div>
          </AppLayoutTitle>
          {filesContent}
        </div>

        <FilePreviewSheet
          owner={owner}
          file={previewFile}
          isOpen={showPreviewSheet}
          onOpenChange={setShowPreviewSheet}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex h-full flex-col">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex h-full flex-col"
        >
          <AppLayoutTitle>
            <div className="flex h-full items-center justify-between">
              <TabsList border={false}>
                <TabsTrigger value="files" label="Working Files" />
                <TabsTrigger value="sandbox" label="Mounted Files" />
              </TabsList>
              <div className="flex items-center gap-2">
                {sandboxStatus && <SandboxStatusChip status={sandboxStatus} />}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closePanel}
                  icon={XMarkIcon}
                />
              </div>
            </div>
          </AppLayoutTitle>
          <TabsContent value="files" className="flex-1 overflow-hidden">
            {filesContent}
          </TabsContent>
          <TabsContent value="sandbox" className="flex-1 overflow-hidden">
            <SandboxTab
              conversationId={conversation.sId}
              disabled={activeTab !== "sandbox"}
              owner={owner}
              onFileClick={handleSandboxFileClick}
            />
          </TabsContent>
        </Tabs>
      </div>

      <FilePreviewSheet
        owner={owner}
        file={previewFile}
        isOpen={showPreviewSheet}
        onOpenChange={setShowPreviewSheet}
      />
    </>
  );
}
