import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import { Card, CardGrid, Icon, ScrollArea, Spinner } from "@dust-tt/sparkle";
import { useMemo } from "react";

import type { ConversationAttachmentRow } from "./types";

interface FilesTabProps {
  isLoading: boolean;
  rows: ConversationAttachmentRow[];
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
            <div className="flex items-center gap-2">
              <Icon visual={FileIcon} size="sm" className="shrink-0" />
              <div className="min-w-0 truncate text-sm font-medium">
                {row.title}
              </div>
            </div>
          </Card>
        );
      })}
    </CardGrid>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="heading-sm pb-2 text-foreground dark:text-foreground-night">
      {children}
    </div>
  );
}

export function FilesTab({ isLoading, rows }: FilesTabProps) {
  const { attached, generated } = useMemo(() => {
    const attached: ConversationAttachmentRow[] = [];
    const generated: ConversationAttachmentRow[] = [];
    for (const row of rows) {
      if (row.source === "user") {
        attached.push(row);
      } else {
        generated.push(row);
      }
    }
    return { attached, generated };
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
        {attached.length > 0 && (
          <div>
            <SectionLabel>Attached</SectionLabel>
            <FileCards rows={attached} />
          </div>
        )}
        {generated.length > 0 && (
          <div>
            <SectionLabel>Generated</SectionLabel>
            <FileCards rows={generated} />
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
