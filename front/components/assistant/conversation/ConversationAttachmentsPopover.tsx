import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  FilePreviewSheet,
  type MinimalFileForPreview,
} from "@app/components/spaces/FilePreviewSheet";
import { useConversationAttachments } from "@app/hooks/conversations/useConversationAttachments";
import {
  isContentNodeAttachmentType,
  isFileAttachmentType,
} from "@app/lib/api/assistant/conversation/attachments";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { CONVERSATION_ATTACHMENTS_UPDATED_EVENT } from "@app/lib/notifications/events";
import type { GetConversationAttachmentsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/attachments";
import { isInteractiveContentType } from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  DataTable,
  Icon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  ScrollArea,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import { Bot, Paperclip, User } from "@app/components/assistant/conversation/icons";
import type {
  CellContext,
  ColumnDef,
  SortingState,
} from "@tanstack/react-table";
import moment from "moment";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ConversationAttachmentItem =
  GetConversationAttachmentsResponseBody["attachments"][number];

type ConversationAttachmentRow = {
  title: string;
  contentType: string;
  fileId: string | null;
  updatedAt: number | null;
  source: "agent" | "user" | null;
  sourceUrl: string | null;
  onClick?: () => void;
};

function conversationAttachmentToRow(
  item: ConversationAttachmentItem,
  onFileClick: (fileId: string, title: string, contentType: string) => void
): ConversationAttachmentRow {
  if (isFileAttachmentType(item)) {
    return {
      title: item.title,
      contentType: item.contentType,
      fileId: item.fileId,
      updatedAt: item.updatedAt ?? item.createdAt ?? null,
      source: item.source,
      sourceUrl: null,
      onClick: () => {
        onFileClick(item.fileId, item.title, item.contentType);
      },
    };
  } else if (isContentNodeAttachmentType(item)) {
    return {
      title: item.title,
      contentType: item.contentType,
      fileId: null,
      updatedAt: null,
      source: null,
      sourceUrl: item.sourceUrl,
      onClick: item.sourceUrl
        ? () => window.open(item.sourceUrl!, "_blank", "noopener,noreferrer")
        : undefined,
    };
  } else {
    assertNever(item);
  }
}

function conversationFileToPreviewFile(
  fileId: string,
  title: string,
  contentType: string
): MinimalFileForPreview {
  return {
    sId: fileId,
    fileName: title,
    contentType,
  };
}

function formatDate(timestamp: number): string {
  return moment(timestamp).fromNow();
}

function EmptyState() {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Conversation attachments & generated content will appear here.
      </div>
    </div>
  );
}

const DEFAULT_SORTING: SortingState = [{ id: "updatedAt", desc: true }];

interface ConversationAttachmentsPopoverProps {
  conversationId: string;
  owner: LightWorkspaceType;
}

export const ConversationAttachmentsPopover = ({
  conversationId,
  owner,
}: ConversationAttachmentsPopoverProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<MinimalFileForPreview | null>(
    null
  );
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const { openPanel } = useConversationSidePanelContext();
  const [isPulsing, setIsPulsing] = useState(false);
  const pulsingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handler = () => {
      setIsPulsing(true);
      if (pulsingTimeoutRef.current) {
        clearTimeout(pulsingTimeoutRef.current);
      }
      pulsingTimeoutRef.current = setTimeout(() => {
        setIsPulsing(false);
      }, 9000);
    };
    window.addEventListener(CONVERSATION_ATTACHMENTS_UPDATED_EVENT, handler);

    return () => {
      if (pulsingTimeoutRef.current) {
        clearTimeout(pulsingTimeoutRef.current);
      }
      window.removeEventListener(
        CONVERSATION_ATTACHMENTS_UPDATED_EVENT,
        handler
      );
    };
  }, []);

  const { attachments, isConversationAttachmentsLoading } =
    useConversationAttachments({
      conversationId,
      owner,
      options: {
        disabled: !isOpen,
      },
    });

  const handleFileClick = useCallback(
    (fileId: string, title: string, contentType: string) => {
      if (isInteractiveContentType(contentType)) {
        openPanel({ type: "interactive_content", fileId });
        setIsOpen(false);
      } else {
        setPreviewFile(
          conversationFileToPreviewFile(fileId, title, contentType)
        );
        setShowPreviewSheet(true);
      }
    },
    [openPanel]
  );

  const { conversationContextFiles } = useMemo(() => {
    const project: ConversationAttachmentItem[] = [];
    const conversation: ConversationAttachmentItem[] = [];
    for (const f of attachments) {
      if (f.isInProjectContext) {
        project.push(f);
      } else {
        conversation.push(f);
      }
    }
    return {
      projectContextFiles: project.map((a) =>
        conversationAttachmentToRow(a, handleFileClick)
      ),
      conversationContextFiles: conversation.map((a) =>
        conversationAttachmentToRow(a, handleFileClick)
      ),
    };
  }, [attachments, handleFileClick]);

  const titleColumn: ColumnDef<ConversationAttachmentRow, unknown> = {
    id: "title",
    accessorKey: "title",
    header: "Title",
    sortingFn: "text",
    meta: { className: "w-full" },
    cell: (info: CellContext<ConversationAttachmentRow, unknown>) => {
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
                <span className="min-w-0 truncate text-sm">{row.title}</span>
              }
            />
          </div>
        </DataTable.CellContent>
      );
    },
  };

  const updatedColumn: ColumnDef<ConversationAttachmentRow, unknown> = {
    id: "updatedAt",
    accessorKey: "updatedAt",
    header: "Updated",
    meta: { className: "w-[115px]" },
    cell: (info: CellContext<ConversationAttachmentRow, unknown>) => {
      const updatedAt = info.row.original.updatedAt;
      if (updatedAt == null) {
        return <DataTable.BasicCellContent label="" />;
      }
      return <DataTable.BasicCellContent label={formatDate(updatedAt)} />;
    },
  };

  const sourceColumn: ColumnDef<ConversationAttachmentRow, unknown> = {
    id: "source",
    accessorKey: "source",
    header: "",
    meta: { className: "w-10 shrink-0" },
    cell: (info: CellContext<ConversationAttachmentRow, unknown>) => {
      const source = info.row.original.source;
      if (source === "agent") {
        return (
          <DataTable.CellContent>
            <Tooltip
              tooltipTriggerAsChild
              label="Generated by agent"
              trigger={
                <span className="inline-flex">
                  <Icon visual={Bot} size="sm" />
                </span>
              }
            />
          </DataTable.CellContent>
        );
      }
      if (source === "user") {
        return (
          <DataTable.CellContent>
            <Tooltip
              tooltipTriggerAsChild
              label="Uploaded by user"
              trigger={
                <span className="inline-flex">
                  <Icon visual={User} size="sm" />
                </span>
              }
            />
          </DataTable.CellContent>
        );
      }
      return <DataTable.BasicCellContent label="" />;
    },
  };

  const conversationColumns: ColumnDef<ConversationAttachmentRow, unknown>[] = [
    titleColumn,
    sourceColumn,
    updatedColumn,
  ];

  const hasFiles = attachments.length > 0;

  return (
    <>
      <PopoverRoot
        open={isOpen}
        onOpenChange={(open) => {
          setIsOpen(open);

          if (open) {
            setIsPulsing(false);
            if (pulsingTimeoutRef.current) {
              clearTimeout(pulsingTimeoutRef.current);
            }
          }
        }}
      >
        <PopoverTrigger asChild>
          <Button
            size="sm"
            tooltip="Attached and Generated content"
            icon={Paperclip}
            variant="ghost"
            isSelect
            isPulsing={isPulsing}
          />
        </PopoverTrigger>
        <PopoverContent
          className="flex w-[420px] flex-col gap-3"
          align="end"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            if (showPreviewSheet) {
              e.preventDefault();
            }
          }}
        >
          <ScrollArea className="flex max-h-[80vh] flex-col gap-4">
            {isConversationAttachmentsLoading ? (
              <div className="flex w-full items-center justify-center p-8">
                <Spinner />
              </div>
            ) : !hasFiles ? (
              <EmptyState />
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-base font-medium text-primary dark:text-primary-night">
                    Attached and Generated content
                  </div>
                  {conversationContextFiles.length > 0 ? (
                    <DataTable
                      columns={conversationColumns}
                      data={conversationContextFiles}
                      sorting={sorting}
                      setSorting={setSorting}
                    />
                  ) : (
                    <EmptyState />
                  )}
                </div>
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </PopoverRoot>

      <FilePreviewSheet
        owner={owner}
        file={previewFile}
        isOpen={showPreviewSheet}
        onOpenChange={setShowPreviewSheet}
      />
    </>
  );
};
