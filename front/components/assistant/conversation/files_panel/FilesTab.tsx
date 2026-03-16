import type {
  ConversationAttachmentRow,
  FilePanelCategory,
} from "@app/components/assistant/conversation/files_panel/types";
import { CATEGORY_CONFIG } from "@app/components/assistant/conversation/files_panel/utils";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  Avatar,
  Card,
  CardGrid,
  Icon,
  ScrollArea,
  SpaceClosedIcon,
  Spinner,
  Tooltip,
} from "@dust-tt/sparkle";
import moment from "moment";
import { useMemo } from "react";

interface FilesTabProps {
  isLoading: boolean;
  rows: ConversationAttachmentRow[];
}

export function FilesTab({ isLoading, rows }: FilesTabProps) {
  const groupedByCategory = useMemo(() => {
    const groups = new Map<FilePanelCategory, ConversationAttachmentRow[]>();
    for (const row of rows) {
      const existing = groups.get(row.category);
      if (existing) {
        existing.push(row);
      } else {
        groups.set(row.category, [row]);
      }
    }
    return groups;
  }, [rows]);

  if (isLoading) {
    return (
      <div className="flex w-full items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
        Conversation attachments & generated content will appear here.
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 p-4">
      <div className="flex flex-col gap-4">
        {CATEGORY_CONFIG.map(({ value, label }) => {
          const categoryRows = groupedByCategory.get(value);
          if (!categoryRows || categoryRows.length === 0) {
            return null;
          }
          return (
            <div key={value}>
              <SectionLabel>{label}</SectionLabel>
              <FileCards rows={categoryRows} />
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function FileCards({ rows }: { rows: ConversationAttachmentRow[] }) {
  return (
    <CardGrid>
      {rows.map((row) => {
        const FileIcon = getFileTypeIcon(row.contentType, row.title);
        return (
          <Card
            key={row.fileId ?? row.title}
            size="sm"
            variant="primary"
            onClick={row.onClick}
          >
            <div className="flex w-full flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon visual={FileIcon} size="sm" className="shrink-0" />
                <div className="min-w-0 flex-1 truncate text-sm font-medium">
                  {row.title}
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
                  {row.date ? `${moment(row.date).fromNow()}.` : null}
                </div>
                <div className="flex items-center gap-1">
                  {row.isInProjectContext && (
                    <Tooltip
                      tooltipTriggerAsChild
                      label="Saved to Project"
                      trigger={
                        <span className="inline-flex">
                          <Icon
                            visual={SpaceClosedIcon}
                            size="xs"
                            className="text-muted-foreground dark:text-muted-foreground-night"
                          />
                        </span>
                      }
                    />
                  )}
                  <CreatorAvatar row={row} />
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </CardGrid>
  );
}

function CreatorAvatar({ row }: { row: ConversationAttachmentRow }) {
  if (row.creator) {
    return (
      <Tooltip
        tooltipTriggerAsChild
        label={row.creator.name}
        trigger={
          <span className="inline-flex">
            <Avatar
              size="xs"
              visual={row.creator.pictureUrl || undefined}
              name={row.creator.name}
              isRounded={row.creator.type === "user"}
            />
          </span>
        }
      />
    );
  }

  return null;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="heading-sm pb-2 text-foreground dark:text-foreground-night">
      {children}
    </div>
  );
}
