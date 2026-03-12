import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import {
  FilePreviewSheet,
  getFilePreviewConfig,
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
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isInteractiveContentType } from "@app/types/files";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AttachmentIcon,
  Button,
  DataTable,
  type DropdownMenuFilterOption,
  DropdownMenuFilters,
  Icon,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  RobotIcon,
  ScrollArea,
  SpaceClosedIcon,
  Spinner,
  Tooltip,
  UserIcon,
} from "@dust-tt/sparkle";
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
  isInProjectContext: boolean;
  onClick?: () => void;
  popoverCategory: PopoverCategoryValue;
};

function conversationAttachmentToRow(
  item: ConversationAttachmentItem,
  onFileClick: (fileId: string, title: string, contentType: string) => void,
  popoverCategory: PopoverCategoryValue
): ConversationAttachmentRow {
  if (isFileAttachmentType(item)) {
    return {
      title: item.title,
      contentType: item.contentType,
      fileId: item.fileId,
      updatedAt: item.updatedAt ?? item.createdAt ?? null,
      source: item.source,
      sourceUrl: null,
      isInProjectContext: item.isInProjectContext,
      popoverCategory,
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
      isInProjectContext: item.isInProjectContext,
      popoverCategory,
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

type PopoverCategoryValue =
  | "frame"
  | "pdf"
  | "image"
  | "audio"
  | "delimited"
  | "knowledge"
  | "other";

function getPopoverCategory(previewCategory: string): {
  value: PopoverCategoryValue;
  label: string;
} {
  switch (previewCategory) {
    case "frame":
      return { value: "frame", label: "Frames" };
    case "pdf":
      return { value: "pdf", label: "PDF" };
    case "image":
      return { value: "image", label: "Images" };
    case "audio":
      return { value: "audio", label: "Audio" };
    case "delimited":
      return { value: "delimited", label: "Tables" };
    default:
      return { value: "other", label: "Other" };
  }
}

interface ConversationAttachmentsPopoverProps {
  conversation?: ConversationWithoutContentType;
  owner: LightWorkspaceType;
}

export const ConversationAttachmentsPopover = ({
  conversation,
  owner,
}: ConversationAttachmentsPopoverProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<MinimalFileForPreview | null>(
    null
  );
  const [showPreviewSheet, setShowPreviewSheet] = useState(false);
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [selectedCategories, setSelectedCategories] = useState<
    PopoverCategoryValue[]
  >([]);
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
      conversationId: conversation?.sId ?? null,
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

  const {
    rows,
    categoryFilters,
  }: {
    rows: ConversationAttachmentRow[];
    categoryFilters: DropdownMenuFilterOption<PopoverCategoryValue>[];
  } = useMemo(() => {
    const rows: ConversationAttachmentRow[] = [];
    const categoryLabelByValue = new Map<PopoverCategoryValue, string>();
    for (const f of attachments) {
      let popoverCategory: PopoverCategoryValue;
      let label: string;

      if (isContentNodeAttachmentType(f)) {
        popoverCategory = "knowledge";
        label = "Knowledge";
      } else {
        const previewConfig = getFilePreviewConfig(f.contentType);
        const mapped = getPopoverCategory(previewConfig.category);
        popoverCategory = mapped.value;
        label = mapped.label;
      }

      categoryLabelByValue.set(popoverCategory, label);

      const row = conversationAttachmentToRow(
        f,
        handleFileClick,
        popoverCategory
      );
      rows.push(row);
    }

    const orderedCategoryValues: PopoverCategoryValue[] = [
      "frame",
      "pdf",
      "image",
      "audio",
      "delimited",
      "knowledge",
      "other",
    ];

    return {
      rows,
      categoryFilters: orderedCategoryValues
        .filter((value) => categoryLabelByValue.has(value))
        .map((value) => ({
          value,
          label: categoryLabelByValue.get(value)!,
        })),
    };
  }, [attachments, handleFileClick]);

  const filteredRows = useMemo(() => {
    if (selectedCategories.length === 0) {
      return rows;
    }

    return rows.filter((row) =>
      selectedCategories.includes(row.popoverCategory)
    );
  }, [rows, selectedCategories]);

  const showProjectColumn =
    Boolean(conversation?.spaceId) &&
    attachments.some((attachment) => attachment.isInProjectContext);

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
                  <Icon visual={RobotIcon} size="sm" />
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
                  <Icon visual={UserIcon} size="sm" />
                </span>
              }
            />
          </DataTable.CellContent>
        );
      }
      return <DataTable.BasicCellContent label="" />;
    },
  };

  const projectContextColumn: ColumnDef<ConversationAttachmentRow, unknown> = {
    id: "projectContext",
    accessorKey: "isInProjectContext",
    header: "",
    meta: { className: "w-10 shrink-0" },
    cell: (info: CellContext<ConversationAttachmentRow, unknown>) => {
      const { isInProjectContext } = info.row.original;
      if (!isInProjectContext) {
        return <DataTable.BasicCellContent label="" />;
      }

      return (
        <DataTable.CellContent>
          <Tooltip
            tooltipTriggerAsChild
            label="Saved to Project"
            trigger={
              <span className="inline-flex">
                <Icon visual={SpaceClosedIcon} size="sm" />
              </span>
            }
          />
        </DataTable.CellContent>
      );
    },
  };

  const conversationColumns: ColumnDef<ConversationAttachmentRow, unknown>[] =
    showProjectColumn
      ? [titleColumn, sourceColumn, projectContextColumn, updatedColumn]
      : [titleColumn, sourceColumn, updatedColumn];

  const hasFiles = attachments.length > 0;

  const handleCategoryFilterClick = useCallback(
    (category: PopoverCategoryValue) => {
      setSelectedCategories((prev) =>
        prev.includes(category)
          ? prev.filter((c) => c !== category)
          : [...prev, category]
      );
    },
    []
  );

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
            icon={AttachmentIcon}
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
                {filteredRows.length > 0 ? (
                  <div className="space-y-2">
                    {categoryFilters.length > 1 && (
                      <DropdownMenuFilters
                        filters={categoryFilters}
                        selectedValues={selectedCategories}
                        onSelectFilter={handleCategoryFilterClick}
                      />
                    )}
                    <DataTable
                      columns={conversationColumns}
                      data={filteredRows}
                      sorting={sorting}
                      setSorting={setSorting}
                    />
                  </div>
                ) : (
                  <EmptyState />
                )}
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
