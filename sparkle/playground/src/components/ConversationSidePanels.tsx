import {
  Archive,
  Bell01,
  Button,
  CoinsStacked01,
  DotsHorizontal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Edit04,
  Folder,
  Link01,
  Trash01,
} from "@dust-tt/sparkle";
import { useState } from "react";

import type {
  Conversation,
  DataSource,
  DataSourceFileType,
} from "../data/types";
import { FilePreviewPanel } from "./FilePreviewPanel";
import { FilesBrowser } from "./FilesBrowser";
import type { PanelSizingType } from "./PanelLayout";

// Fake "Files" and "Credit usage" conversation side panels mirroring front's
// conversation side panel, plus the shared model (view kinds, sizing rules,
// content renderer, top-bar actions) the three full-app playgrounds wire to.
// Playground-only: no real functionality.

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

// ── Side-panel model ─────────────────────────────────────────────────────────
// Side panels that open next to a conversation, shared by the Inbox, Pods and
// People_Agent playgrounds so the three stay consistent.
//
//   kind      sizing                        content
//   citation  shared (frame icon → focus)   placeholder preview (see note below)
//   file      shared (frame type → focus)   FilePreviewPanel, fullscreen enabled
//   files     secondary                     FilesBrowser over conversation files
//   credits   secondary                     fake credit usage panel

export type SelectedCitation = { title: string; icon?: string };

export type SidePanelView =
  | { kind: "citation"; citation: SelectedCitation }
  | { kind: "file"; dataSource: DataSource }
  | { kind: "files" }
  | { kind: "credits" };

/**
 * File views (any file type, opened from anywhere) get the fullscreen toggle.
 * Accepts the wider P3 union — a slot may also hold a conversation.
 */
export function isFileView(view: { kind: string } | null | undefined): boolean {
  return view?.kind === "file" || view?.kind === "citation";
}

// Map a message-citation icon onto the DataSource file-type vocabulary so the
// conversation Files panel can reuse the pod FilesBrowser.
function citationFileType(icon?: string): DataSourceFileType {
  switch (icon) {
    case "table":
      return "xlsx";
    case "image":
      return "png";
    case "frame":
      return "frame";
    case "notion":
    case "slack":
      return "md";
    default:
      return "doc";
  }
}

// Files "in" a conversation: derived from its message citations, shaped as
// DataSources. Conversations without their own messages render a random
// message set (see ConversationView), so those fall back to the whole pool's
// citations.
export function conversationFilesFor(
  conversation: Conversation | null | undefined,
  pool: Conversation[]
): DataSource[] {
  const messageSources = conversation?.messages?.length ? [conversation] : pool;
  const seen = new Set<string>();
  const files: DataSource[] = [];
  for (const source of messageSources) {
    for (const item of source.messages ?? []) {
      if (item.kind !== "message") continue;
      for (const citation of item.citations ?? []) {
        if (seen.has(citation.id)) continue;
        seen.add(citation.id);
        files.push({
          id: `conv-file-${citation.id}`,
          kind: "file",
          fileName: citation.title,
          parentId: null,
          source: "pod",
          fileType: citationFileType(citation.icon),
          createdBy: item.ownerId,
          createdAt: item.timestamp,
          updatedAt: item.timestamp,
        });
      }
    }
  }
  return files;
}

export function sidePanelLabel(view: SidePanelView): string {
  switch (view.kind) {
    case "citation":
      return view.citation.title;
    case "file":
      return view.dataSource.fileName;
    case "files":
      return "Files";
    case "credits":
      return "Credit usage";
  }
}

// Sizing: file previews share the space with the focus panel — unless the
// file is a frame, which takes focus itself; files/credits lists stay
// secondary.
export function sidePanelSizing(view: SidePanelView): PanelSizingType {
  const previewSizing = (isFrame: boolean): PanelSizingType =>
    isFrame ? "default" : "shared";
  switch (view.kind) {
    case "citation":
      return previewSizing(view.citation.icon === "frame");
    case "file":
      return previewSizing(view.dataSource.fileType === "frame");
    case "files":
    case "credits":
      return "secondary";
  }
}

// NOTE: message citations open this placeholder (they are titles, not
// DataSources); files opened from a Files panel or a pod render the real
// FilePreviewPanel. Map citations to DataSources if these should unify.
function citationPreview(citation: SelectedCitation) {
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <p className="text-sm font-medium text-foreground">{citation.title}</p>
      <div className="flex-1 rounded-lg border border-separator bg-muted-background p-4 text-sm text-muted-foreground">
        Document preview placeholder
      </div>
    </div>
  );
}

/**
 * Renders one side-panel kind. `filesSource` is the conversation whose files
 * the "files" kind lists; opening one replaces the panel's content with the
 * file preview in place (same slot, so the panel never closes and reopens).
 */
export function sidePanelContent({
  view,
  setView,
  filesSource,
  conversationPool,
}: {
  view: SidePanelView;
  setView: (view: SidePanelView) => void;
  filesSource: Conversation | null | undefined;
  conversationPool: Conversation[];
}) {
  switch (view.kind) {
    case "citation":
      return citationPreview(view.citation);
    case "file":
      return (
        <FilePreviewPanel dataSource={view.dataSource} variant="document" />
      );
    case "files":
      return (
        <ConversationFilesPanel
          files={conversationFilesFor(filesSource, conversationPool)}
          onFileOpen={(dataSource) => setView({ kind: "file", dataSource })}
        />
      );
    case "credits":
      return <ConversationCreditPanel />;
  }
}

/**
 * Conversation top-bar actions, mirroring front's conversation title:
 * credit usage, files, and a fake "..." menu. The side panel opens in the
 * slot below the conversation; clicking the same action again closes it.
 */
export function ConversationActions({
  onToggle,
}: {
  onToggle: (kind: "files" | "credits") => void;
}) {
  return (
    <>
      <Button
        size="sm"
        variant="ghost-secondary"
        icon={CoinsStacked01}
        tooltip="Credit usage"
        onClick={() => onToggle("credits")}
      />
      <Button
        size="sm"
        variant="ghost-secondary"
        icon={Folder}
        tooltip="Files"
        onClick={() => onToggle("files")}
      />
      {/* Fake conversation menu — options are listed but do nothing. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost-secondary" icon={DotsHorizontal} />
        </DropdownMenuTrigger>
        <DropdownMenuContent collisionPadding={8}>
          <DropdownMenuItem label="Rename" icon={Edit04} />
          <DropdownMenuItem label="Copy link" icon={Link01} />
          <DropdownMenuItem label="Mute notifications" icon={Bell01} />
          <DropdownMenuSeparator />
          <DropdownMenuItem label="Archive" icon={Archive} />
          <DropdownMenuItem label="Delete" icon={Trash01} variant="warning" />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
