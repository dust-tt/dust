import { useState } from "react";

import type { DataSource } from "../data/types";
import { FilesBrowser } from "./FilesBrowser";

// Fake "Files" and "Credit usage" conversation side panels mirroring front's
// conversation side panel. Playground-only: no real functionality.

/**
 * Conversation "Files" panel — the very same browser as the pod Files tab,
 * flat (no folders), fed with the conversation's files.
 */
export function ConversationFilesPanel({
  files,
  onFileOpen,
}: {
  files: DataSource[];
  onFileOpen: (dataSource: DataSource) => void;
}) {
  // Fake delete: rows disappear for this panel instance only.
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const visibleFiles = files.filter((file) => !removedIds.has(file.id));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-3">
      <FilesBrowser
        dataSources={visibleFiles}
        foldersEnabled={false}
        emptyMessage="No files in this conversation."
        onFileOpen={onFileOpen}
        onDeleteFile={(fileId) =>
          setRemovedIds((prev) => new Set(prev).add(fileId))
        }
      />
    </div>
  );
}

const FAKE_CREDIT_ROWS = [
  { label: "@ContentWriter", detail: "3 messages", credits: 42 },
  { label: "@CodeReviewer", detail: "2 messages", credits: 28 },
  { label: "Web search", detail: "4 tool calls", credits: 12 },
  { label: "Document extraction", detail: "1 tool call", credits: 6 },
];

export function ConversationCreditPanel() {
  const total = FAKE_CREDIT_ROWS.reduce((sum, row) => sum + row.credits, 0);
  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <div className="rounded-xl border border-separator bg-muted-background p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Conversation total
        </p>
        <p className="mt-1 text-2xl font-semibold text-foreground">
          {total} credits
        </p>
      </div>
      <div className="flex flex-col">
        {FAKE_CREDIT_ROWS.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between border-b border-separator py-2.5 last:border-b-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.detail}</p>
            </div>
            <span className="text-sm font-medium text-foreground">
              {row.credits}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
