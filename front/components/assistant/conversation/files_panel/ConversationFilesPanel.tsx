import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  FilePreviewSheet,
  type MinimalFileForPreview,
} from "@app/components/spaces/FilePreviewSheet";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import { useConversationSandboxFiles } from "@app/hooks/conversations/useConversationSandboxFiles";
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

import { FilesTab } from "./FilesTab";
import { SandboxStatusChip } from "./SandboxStatusChip";
import { SandboxTab } from "./SandboxTab";
import type { ConversationAttachmentItem } from "./types";
import { buildSandboxTree, conversationAttachmentToRow } from "./utils";

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

  const { sandboxFiles, sandboxStatus, isSandboxFilesLoading } =
    useConversationSandboxFiles({
      conversationId: conversation.sId,
      owner,
    });

  const handleFileClick = useCallback(
    (fileId: string, title: string, contentType: string) => {
      if (isInteractiveContentType(contentType)) {
        openPanel({ type: "interactive_content", fileId });
      } else {
        setPreviewFile({ sId: fileId, fileName: title, contentType });
        setShowPreviewSheet(true);
      }
    },
    [openPanel]
  );

  const conversationContextFiles = useMemo(() => {
    const conversationFiles: ConversationAttachmentItem[] = [];
    for (const f of attachments) {
      if (!f.isInProjectContext) {
        conversationFiles.push(f);
      }
    }
    return conversationFiles.map((a) =>
      conversationAttachmentToRow(a, handleFileClick)
    );
  }, [attachments, handleFileClick]);

  const sandboxTree = useMemo(
    () => buildSandboxTree(sandboxFiles),
    [sandboxFiles]
  );

  const hasSandbox = sandboxStatus !== null;

  const filesContent = (
    <FilesTab
      isLoading={isConversationAttachmentsLoading}
      rows={conversationContextFiles}
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
              isLoading={isSandboxFilesLoading}
              sandboxTree={sandboxTree}
              onFileClick={handleFileClick}
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
