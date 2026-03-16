import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { FilesTab } from "@app/components/assistant/conversation/files_panel/FilesTab";
import { SandboxStatusChip } from "@app/components/assistant/conversation/files_panel/SandboxStatusChip";
import { SandboxTab } from "@app/components/assistant/conversation/files_panel/SandboxTab";
import type {
  ConversationAttachmentItem,
  SandboxTreeNode,
} from "@app/components/assistant/conversation/files_panel/types";
import { conversationAttachmentToRow } from "@app/components/assistant/conversation/files_panel/utils";
import {
  FilePreviewSheet,
  type MinimalFileForPreview,
} from "@app/components/spaces/FilePreviewSheet";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { useConversationSandboxStatus } from "@app/hooks/conversations/useConversationSandboxStatus";
import { isFileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
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
import { useCallback, useMemo, useState } from "react";

interface ConversationFilesPanelProps {
  conversation: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export function ConversationFilesPanel({
  conversation,
  owner,
}: ConversationFilesPanelProps) {
  const [previewFile, setPreviewFile] = useState<MinimalFileForPreview | null>(
    null
  );
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const { openPanel, closePanel } = useConversationSidePanelContext();

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
    (node: SandboxTreeNode) => {
      if (node.fileId) {
        openFile({
          fileId: node.fileId,
          title: node.name,
          contentType: node.contentType,
        });
      }
    },
    [openFile]
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
              <span className="text-sm font-normal text-primary dark:text-primary-night">
                Files
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
        <Tabs defaultValue="files" className="flex h-full flex-col">
          <AppLayoutTitle>
            <div className="flex h-full items-center justify-between">
              <TabsList border={false}>
                <TabsTrigger value="files" label="Files" />
                <TabsTrigger value="sandbox" label="Sandbox" />
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
