"use client";

import * as React from "react";

import { Button } from "@sparkle/components/Button";
import { FileThumbnail } from "@sparkle/components/FileThumbnail";
import { ScrollArea } from "@sparkle/components/ScrollArea";
import { Spinner } from "@sparkle/components/Spinner";
import { Tabs, TabsList, TabsTrigger } from "@sparkle/components/Tabs";
import { Tree } from "@sparkle/components/Tree";
import {
  ArrowLeft,
  ArrowRight,
  Columns03,
  File01,
  Folder,
  Grid01,
  LayoutGrid01,
  List,
  XClose,
} from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export type FileSystemView = "icons" | "list" | "columns" | "gallery";

export type FileSystemFolderItem = {
  kind: "folder";
  /** Folder prefix, e.g. `"invoices/2026/"`. A trailing slash is added when missing. */
  path: string;
  name?: string;
  parentPath?: string;
  /** Set when children exist but are not in `items` yet; enables `loadChildren`. */
  hasChildren?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type FileSystemFileItem = {
  kind: "file";
  /** Display/canonical path, e.g. `"invoices/2026/jan.pdf"`. */
  path: string;
  /** Original object key (S3/R2). Defaults to `path`. */
  key?: string;
  name?: string;
  parentPath?: string;
  contentType?: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
  etag?: string;
  /** Optional if already public/presigned. Otherwise resolved via `getFileUrl`. */
  url?: string;
  /** Externally generated thumbnail. The component never renders documents itself. */
  previewImageUrl?: string | null;
  /**
   * Externally generated page thumbnails (first entry is the cover). When a
   * file has more than one page, large thumbnails show a hover pager.
   */
  previewImageUrls?: string[] | null;
  /**
   * Total page count when it exceeds `previewImageUrls.length`; the pager
   * loads the remaining pages on demand via `loadPreviewImageUrl`.
   */
  previewPageCount?: number;
  /** Thumbnail aspect ratio (width / height). Defaults to a portrait page. */
  previewAspectRatio?: number;
  metadata?: Record<string, string>;
};

export type FileSystemItem = FileSystemFolderItem | FileSystemFileItem;

export type FileSystemLoadChildrenArgs = {
  path: string;
  cursor: string | null;
};

export type FileSystemLoadChildrenResult = {
  items: FileSystemItem[];
  nextCursor?: string | null;
};

export type FileSystemProps = {
  /** Flat manifest. Folders are optional; missing prefixes are inferred from file paths. */
  items: FileSystemItem[];
  className?: string;
  /** Label for the root folder. */
  title?: string;
  defaultView?: FileSystemView;
  view?: FileSystemView;
  onViewChange?: (view: FileSystemView) => void;
  /** Folder prefix to open initially, e.g. `"invoices/"`. */
  defaultPath?: string;
  onSelectionChange?: (item: FileSystemItem | null) => void;
  /**
   * Called on file open (double-click). When omitted, the resolved URL is
   * opened in a new tab.
   */
  onFileOpen?: (file: FileSystemFileItem, url: string | null) => void;
  /** Resolve a URL (e.g. presigned) for a file without one. */
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>;
  /** Lazily fetch children for folders with `hasChildren` and no loaded entries. */
  loadChildren?: (
    args: FileSystemLoadChildrenArgs
  ) => Promise<FileSystemLoadChildrenResult>;
  /** Custom preview node for files without `previewImageUrl`. */
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode;
  /**
   * Lazily render a page thumbnail beyond the eagerly provided
   * `previewImageUrls` (the pager calls this as pages come into view).
   */
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>;
};

// ─── Internal types ───────────────────────────────────────────────────────────

type FolderEntry = FileSystemFolderItem & {
  name: string;
  parentPath: string;
};

type FileEntry = FileSystemFileItem & {
  key: string;
  name: string;
  parentPath: string;
};

type FileSystemEntry = FolderEntry | FileEntry;

type FileSystemIndex = {
  children: Map<string, FileSystemEntry[]>;
  files: Map<string, FileEntry>;
  folders: Map<string, FolderEntry>;
};

// ─── Utility functions ────────────────────────────────────────────────────────

function normalizeFolderPath(path: string) {
  if (!path || path === "/") return "";
  return path.endsWith("/") ? path : `${path}/`;
}

function pathName(path: string) {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const separatorIndex = trimmed.lastIndexOf("/");
  return separatorIndex === -1 ? trimmed : trimmed.slice(separatorIndex + 1);
}

function pathParent(path: string) {
  const trimmed = path.endsWith("/") ? path.slice(0, -1) : path;
  const separatorIndex = trimmed.lastIndexOf("/");
  return separatorIndex === -1 ? "" : trimmed.slice(0, separatorIndex + 1);
}

function fileExtension(name: string) {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex === -1 ? "" : name.slice(dotIndex + 1).toLowerCase();
}

const FILE_KIND_LABELS: Record<string, string> = {
  csv: "CSV Document",
  doc: "Word Document",
  docx: "Word Document",
  gif: "GIF Image",
  jpeg: "JPEG Image",
  jpg: "JPEG Image",
  md: "Markdown Document",
  pdf: "PDF Document",
  png: "PNG Image",
  ppt: "PowerPoint Presentation",
  pptx: "PowerPoint Presentation",
  svg: "SVG Image",
  tsv: "TSV Document",
  txt: "Plain Text",
  webp: "WebP Image",
  xls: "Excel Workbook",
  xlsx: "Excel Workbook",
  zip: "ZIP Archive",
};

function fileKindLabel(file: FileEntry) {
  const byExtension = FILE_KIND_LABELS[fileExtension(file.name)];
  if (byExtension) return byExtension;
  if (file.contentType?.startsWith("image/")) return "Image";
  return file.contentType ?? "Document";
}

function formatByteSize(size: number | undefined) {
  if (size === undefined) return null;
  if (size < 1000) return `${size} bytes`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size;
  for (const unit of units) {
    value /= 1000;
    if (value < 1000 || unit === "TB") {
      return `${value >= 100 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2).replace(/\.?0+$/, "")} ${unit}`;
    }
  }
  return null;
}

function formatTimestamp(value: string | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const day = date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${day} at ${time}`;
}

function buildFileSystemIndex(items: FileSystemItem[]): FileSystemIndex {
  const folders = new Map<string, FolderEntry>();
  const files = new Map<string, FileEntry>();

  const ensureFolderChain = (folderPath: string) => {
    let path = normalizeFolderPath(folderPath);
    while (path && !folders.has(path)) {
      folders.set(path, {
        kind: "folder",
        name: pathName(path),
        parentPath: pathParent(path),
        path,
      });
      path = pathParent(path);
    }
  };

  for (const item of items) {
    if (item.kind === "folder") {
      const path = normalizeFolderPath(item.path);
      if (!path) continue;
      folders.set(path, {
        ...item,
        name: item.name ?? pathName(path),
        parentPath: normalizeFolderPath(item.parentPath ?? pathParent(path)),
        path,
      });
      ensureFolderChain(pathParent(path));
    } else {
      if (!item.path) continue;
      files.set(item.path, {
        ...item,
        key: item.key ?? item.path,
        name: item.name ?? pathName(item.path),
        parentPath: normalizeFolderPath(
          item.parentPath ?? pathParent(item.path)
        ),
      });
      ensureFolderChain(pathParent(item.path));
    }
  }

  const children = new Map<string, FileSystemEntry[]>();
  const pushChild = (entry: FileSystemEntry) => {
    const siblings = children.get(entry.parentPath);
    if (siblings) {
      siblings.push(entry);
    } else {
      children.set(entry.parentPath, [entry]);
    }
  };

  for (const folder of folders.values()) pushChild(folder);
  for (const file of files.values()) pushChild(file);
  for (const siblings of children.values()) {
    siblings.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );
  }

  return { children, files, folders };
}

function folderHasChildren(index: FileSystemIndex, folder: FolderEntry) {
  return (
    (index.children.get(folder.path)?.length ?? 0) > 0 ||
    folder.hasChildren === true
  );
}

// ─── Folder glyph ─────────────────────────────────────────────────────────────

const FOLDER_GLYPH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 50" width="64" height="50"><defs><linearGradient id="fs-folder-back" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3dabf5"/><stop offset="1" stop-color="#1d84dd"/></linearGradient><linearGradient id="fs-folder-front" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7accfb"/><stop offset="1" stop-color="#37a0ef"/></linearGradient></defs><path d="M5 10c0-3.31 2.69-6 6-6h10.9c1.6 0 3.13.7 4.18 1.9l1.5 1.73a3.5 3.5 0 0 0 2.64 1.22H54c2.76 0 5 2.24 5 5V40c0 3.87-3.13 7-7 7H12c-3.87 0-7-3.13-7-7V10Z" fill="url(#fs-folder-back)"/><path d="M5 15.5h54V40c0 3.87-3.13 7-7 7H12c-3.87 0-7-3.13-7-7V15.5Z" fill="url(#fs-folder-front)"/></svg>`;
const FOLDER_GLYPH_DATA_URL = `data:image/svg+xml,${encodeURIComponent(FOLDER_GLYPH_SVG)}`;

function FileSystemFolderGlyph({ className }: { className?: string }) {
  return (
    <img
      src={FOLDER_GLYPH_DATA_URL}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
    />
  );
}

// ─── File visual ──────────────────────────────────────────────────────────────

function FileGenericPreview({ file }: { file: FileEntry }) {
  const extension = fileExtension(file.name);
  return (
    <div className="s-flex s-size-full s-flex-col s-items-center s-justify-center s-gap-1.5 s-bg-white s-text-neutral-400 dark:s-bg-neutral-100">
      <File01 className="s-size-1/3 s-min-h-4 s-min-w-4" />
      {extension ? (
        <span className="s-text-[min(0.625rem,18cqw)] s-font-semibold s-tracking-wide s-uppercase">
          {extension}
        </span>
      ) : null}
    </div>
  );
}

function filePreviewUrls(file: FileSystemFileItem) {
  if (file.previewImageUrls?.length) return file.previewImageUrls;
  return file.previewImageUrl ? [file.previewImageUrl] : [];
}

function FileVisual({
  file,
  className,
  loadPreviewImageUrl,
  pageable = false,
  previewAspectRatio,
  previewClassName,
  renderFilePreview,
}: {
  file: FileEntry;
  className?: string;
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>;
  pageable?: boolean;
  previewAspectRatio?: number;
  previewClassName?: string;
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode;
}) {
  const previewUrls = filePreviewUrls(file);
  const canLoadLazily = pageable && Boolean(loadPreviewImageUrl);
  const totalPages = Math.max(
    previewUrls.length,
    canLoadLazily ? (file.previewPageCount ?? 0) : 0
  );
  const [pageIndex, setPageIndex] = React.useState(0);
  const [lazyPageUrls, setLazyPageUrls] = React.useState<
    Record<number, string>
  >({});
  const clampedPageIndex = Math.min(pageIndex, Math.max(totalPages - 1, 0));
  const previewUrl =
    previewUrls[clampedPageIndex] ?? lazyPageUrls[clampedPageIndex] ?? null;
  const resolvedAspectRatio = file.previewAspectRatio ?? previewAspectRatio;
  const isLazyPagePending =
    canLoadLazily && !previewUrl && clampedPageIndex < totalPages;

  const fileRef = React.useRef(file);
  React.useEffect(() => {
    fileRef.current = file;
  });

  React.useEffect(() => {
    setPageIndex(0);
    setLazyPageUrls({});
  }, [file.path]);

  React.useEffect(() => {
    if (!isLazyPagePending || !loadPreviewImageUrl) return;
    let isCurrent = true;
    void loadPreviewImageUrl(fileRef.current, clampedPageIndex)
      .then((url) => {
        if (isCurrent && url) {
          setLazyPageUrls((previous) => ({
            ...previous,
            [clampedPageIndex]: url,
          }));
        }
      })
      .catch(() => {});
    return () => {
      isCurrent = false;
    };
  }, [clampedPageIndex, file.path, isLazyPagePending, loadPreviewImageUrl]);

  const customPreview =
    !previewUrl && !isLazyPagePending ? renderFilePreview?.(file) : null;
  const showPager = pageable && totalPages > 1;

  const thumbnail = (
    <FileThumbnail
      file={{ name: file.name, type: file.contentType ?? "" }}
      className={cn("@container", !showPager && className)}
      previewAspectRatio={resolvedAspectRatio}
      previewClassName={cn(
        "s-bg-white dark:s-bg-neutral-100",
        previewClassName
      )}
      previewImageUrl={previewUrl ?? undefined}
      isLoading={isLazyPagePending}
      previewContent={
        previewUrl || isLazyPagePending
          ? undefined
          : (customPreview ?? <FileGenericPreview file={file} />)
      }
    />
  );

  if (!showPager) return thumbnail;

  return (
    <div className={cn("s-group/pager s-relative", className)}>
      {thumbnail}
      <div className="s-absolute s-inset-x-0 s-bottom-1.5 s-flex s-items-center s-justify-center s-gap-1 s-opacity-0 s-transition-opacity group-focus-within/pager:s-opacity-100 group-hover/pager:s-opacity-100">
        <button
          type="button"
          aria-label="Previous page"
          tabIndex={-1}
          disabled={clampedPageIndex === 0}
          onClick={(event) => {
            event.stopPropagation();
            setPageIndex((previous) => Math.max(0, previous - 1));
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="s-flex s-size-6 s-items-center s-justify-center s-rounded-md s-bg-background/80 s-text-foreground s-shadow-xs s-backdrop-blur-sm s-transition-colors s-outline-none hover:s-bg-background focus-visible:s-ring-2 disabled:s-pointer-events-none disabled:s-opacity-40 dark:s-bg-background-night/80 dark:hover:s-bg-background-night"
        >
          <ArrowLeft className="s-size-3.5" />
        </button>
        <span className="s-rounded-md s-bg-background/80 s-px-1.5 s-py-0.5 s-text-[10px] s-font-medium s-text-muted-foreground s-tabular-nums s-shadow-xs s-backdrop-blur-sm dark:s-bg-background-night/80 dark:s-text-muted-foreground-night">
          {clampedPageIndex + 1}/{totalPages}
        </span>
        <button
          type="button"
          aria-label="Next page"
          tabIndex={-1}
          disabled={clampedPageIndex >= totalPages - 1}
          onClick={(event) => {
            event.stopPropagation();
            setPageIndex((previous) => Math.min(totalPages - 1, previous + 1));
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          className="s-flex s-size-6 s-items-center s-justify-center s-rounded-md s-bg-background/80 s-text-foreground s-shadow-xs s-backdrop-blur-sm s-transition-colors s-outline-none hover:s-bg-background focus-visible:s-ring-2 disabled:s-pointer-events-none disabled:s-opacity-40 dark:s-bg-background-night/80 dark:hover:s-bg-background-night"
        >
          <ArrowRight className="s-size-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── View options ─────────────────────────────────────────────────────────────

const VIEW_OPTIONS: Array<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: FileSystemView;
}> = [
  { icon: Grid01, label: "Grid", value: "icons" },
  { icon: List, label: "List", value: "list" },
  { icon: Columns03, label: "Columns", value: "columns" },
  { icon: LayoutGrid01, label: "Gallery", value: "gallery" },
];

// ─── Debounced value ──────────────────────────────────────────────────────────

function useSettledValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    if (Object.is(settled, value)) return;
    const timeout = window.setTimeout(() => setSettled(value), delayMs);
    return () => window.clearTimeout(timeout);
  }, [delayMs, settled, value]);
  return settled;
}

// ─── URL resolver ─────────────────────────────────────────────────────────────

function useResolvedFileUrl(
  file: FileEntry | null,
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>
) {
  const [state, setState] = React.useState<{
    isResolving: boolean;
    url: string | null;
  }>({ isResolving: false, url: file?.url ?? null });
  const fileRef = React.useRef(file);
  React.useEffect(() => {
    fileRef.current = file;
  });

  const filePath = file?.path ?? null;
  const fileUrl = file?.url ?? null;

  React.useEffect(() => {
    const currentFile = fileRef.current;
    if (!currentFile || fileUrl || !getFileUrl) {
      setState({ isResolving: false, url: fileUrl });
      return;
    }
    let isCurrent = true;
    setState({ isResolving: true, url: null });
    void Promise.resolve(getFileUrl(currentFile))
      .then((url) => {
        if (isCurrent) setState({ isResolving: false, url });
      })
      .catch(() => {
        if (isCurrent) setState({ isResolving: false, url: null });
      });
    return () => {
      isCurrent = false;
    };
  }, [filePath, fileUrl, getFileUrl]);

  return state;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function FileSystemEmptyState({
  label,
  isLoading = false,
}: {
  label: string;
  isLoading?: boolean;
}) {
  return (
    <div
      className={cn(
        "s-flex s-size-full s-items-center s-justify-center s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night",
        isLoading && "s-animate-pulse motion-reduce:s-animate-none"
      )}
    >
      {label}
    </div>
  );
}

// ─── Arrow key grid navigation ────────────────────────────────────────────────

const ARROW_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
]);

function moveGridSelection({
  entries,
  itemRefs,
  key,
  onSelect,
  selectedPath,
}: {
  entries: FileSystemEntry[];
  itemRefs: Map<string, HTMLButtonElement>;
  key: string;
  onSelect: (entry: FileSystemEntry | null) => void;
  selectedPath: string | null;
}) {
  if (entries.length === 0) return false;

  const currentIndex = entries.findIndex((entry) => entry.path === selectedPath);
  let nextEntry: FileSystemEntry | undefined;

  if (currentIndex === -1) {
    nextEntry = entries[0];
  } else if (key === "ArrowLeft" || key === "ArrowRight") {
    nextEntry = entries[currentIndex + (key === "ArrowLeft" ? -1 : 1)];
  } else {
    const currentElement = itemRefs.get(entries[currentIndex].path);
    if (!currentElement) return false;
    const currentRect = currentElement.getBoundingClientRect();
    let bestScore = Infinity;

    for (const entry of entries) {
      if (entry.path === selectedPath) continue;
      const rect = itemRefs.get(entry.path)?.getBoundingClientRect();
      if (!rect) continue;
      const rowDelta =
        key === "ArrowDown"
          ? rect.top - currentRect.top
          : currentRect.top - rect.top;
      if (rowDelta <= 1) continue;
      const score = rowDelta * 1000 + Math.abs(rect.left - currentRect.left);
      if (score < bestScore) {
        bestScore = score;
        nextEntry = entry;
      }
    }
  }

  if (!nextEntry) return false;
  onSelect(nextEntry);
  itemRefs.get(nextEntry.path)?.focus();
  return true;
}

// ─── View props ───────────────────────────────────────────────────────────────

type FileSystemViewProps = {
  currentPath: string;
  entries: FileSystemEntry[];
  getFileUrl?: (file: FileSystemFileItem) => string | Promise<string>;
  index: FileSystemIndex;
  loadPreviewImageUrl?: (
    file: FileSystemFileItem,
    pageIndex: number
  ) => Promise<string | null>;
  loadingFolders: Set<string>;
  onOpen: (entry: FileSystemEntry) => void;
  onSelect: (entry: FileSystemEntry | null) => void;
  renderFilePreview?: (file: FileSystemFileItem) => React.ReactNode;
  selectedEntry: FileSystemEntry | null;
  selectedPath: string | null;
};

// ─── Icons view ───────────────────────────────────────────────────────────────

function FileSystemIconsView({
  entries,
  onOpen,
  onSelect,
  renderFilePreview,
  selectedPath,
}: FileSystemViewProps) {
  const itemRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const tabStopPath = entries.some((entry) => entry.path === selectedPath)
    ? selectedPath
    : (entries[0]?.path ?? null);

  return (
    <ScrollArea orientation="vertical" viewportClassName="s-p-3">
      {/* Clicking empty space in the viewport deselects. The div fills the full
          scroll height so dead zones below the grid still trigger deselect. */}
      <div
        className="s-min-h-full"
        onClick={(event) => {
          if (event.target === event.currentTarget) onSelect(null);
        }}
      >
        <div
          role="listbox"
          aria-label="Files"
          className="s-grid s-grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] s-gap-x-1 s-gap-y-3"
          onKeyDown={(event) => {
            if (!ARROW_KEYS.has(event.key)) return;
            if (
              moveGridSelection({
                entries,
                itemRefs: itemRefs.current,
                key: event.key,
                onSelect,
                selectedPath,
              })
            ) {
              event.preventDefault();
            }
          }}
        >
          {entries.map((entry) => {
            const isSelected = entry.path === selectedPath;
            return (
              <button
                key={entry.path}
                type="button"
                role="option"
                aria-selected={isSelected}
                tabIndex={entry.path === tabStopPath ? 0 : -1}
                ref={(element) => {
                  if (element) {
                    itemRefs.current.set(entry.path, element);
                  } else {
                    itemRefs.current.delete(entry.path);
                  }
                }}
                onClick={() => onSelect(entry)}
                onDoubleClick={() => onOpen(entry)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpen(entry);
                }}
                className="s-group s-flex s-flex-col s-items-center s-gap-1.5 s-outline-none"
              >
                <span
                  className={cn(
                    "s-flex s-h-16 s-w-20 s-items-center s-justify-center s-rounded-lg s-p-1 s-transition-colors focus-visible:s-ring-2",
                    isSelected &&
                      "s-bg-primary-100 dark:s-bg-primary-100-night"
                  )}
                >
                  {entry.kind === "folder" ? (
                    <FileSystemFolderGlyph className="s-h-13 s-w-auto s-drop-shadow-sm" />
                  ) : (
                    <FileVisual
                      file={entry}
                      className={cn(
                        "s-rounded-sm s-shadow-xs",
                        (entry.previewAspectRatio ?? 0.78) > 1.2
                          ? "s-w-[4.75rem]"
                          : "s-w-12"
                      )}
                      previewAspectRatio={0.78}
                      renderFilePreview={renderFilePreview}
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "s-max-w-full s-rounded-sm s-px-1.5 s-py-px s-text-center s-text-xs s-leading-tight s-break-words",
                    isSelected
                      ? "s-bg-primary s-text-primary-foreground dark:s-bg-primary-night dark:s-text-primary-foreground-night"
                      : "s-text-foreground dark:s-text-foreground-night"
                  )}
                >
                  <span className="s-line-clamp-2">{entry.name}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </ScrollArea>
  );
}

// ─── List view (uses Sparkle Tree) ────────────────────────────────────────────

/**
 * The list view uses Sparkle's Tree component for rendering.
 *
 * TODO: For large file trees (1000+ files), consider upgrading to @pierre/trees
 * which provides virtualized rendering and richer keyboard navigation. See the
 * original Extend UI implementation for reference.
 */
function FileSystemListView({
  currentPath,
  index,
  onOpen,
  onSelect,
  selectedPath,
}: FileSystemViewProps) {
  const entries = index.children.get(currentPath) ?? [];

  if (entries.length === 0) {
    return <FileSystemEmptyState label="This folder is empty" />;
  }

  return (
    <div className="s-flex s-size-full s-flex-col">
      <div className="s-flex s-shrink-0 s-items-center s-border-b s-border-border s-py-1.5 s-pr-6 s-pl-[52px] s-text-xs s-font-medium s-text-muted-foreground dark:s-border-border-night dark:s-text-muted-foreground-night">
        <span className="s-flex-1">Name</span>
        <span className="s-w-44 s-text-right">Date Modified</span>
        <span className="s-w-20 s-text-right">Size</span>
      </div>
      <ScrollArea orientation="vertical" className="s-flex-1">
        <Tree>
          {entries.map((entry) => (
            <FileSystemTreeEntry
              key={entry.path}
              entry={entry}
              index={index}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </Tree>
      </ScrollArea>
    </div>
  );
}

function FileSystemTreeEntry({
  entry,
  index,
  selectedPath,
  onSelect,
  onOpen,
}: {
  entry: FileSystemEntry;
  index: FileSystemIndex;
  selectedPath: string | null;
  onSelect: (entry: FileSystemEntry | null) => void;
  onOpen: (entry: FileSystemEntry) => void;
}) {
  const isSelected = entry.path === selectedPath;
  const date =
    entry.kind === "file"
      ? formatTimestamp(entry.updatedAt ?? entry.createdAt)
      : formatTimestamp(entry.updatedAt ?? entry.createdAt);
  const size = entry.kind === "file" ? formatByteSize(entry.size) : null;

  const metadata = (
    <div className="s-ml-auto s-flex s-items-center s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
      <span className="s-w-44 s-text-right">{date ?? "—"}</span>
      <span className="s-w-20 s-text-right">{size ?? "—"}</span>
    </div>
  );

  if (entry.kind === "folder") {
    const childEntries = index.children.get(entry.path) ?? [];
    return (
      <div onDoubleClick={() => onOpen(entry)}>
        <Tree.Item
          type={folderHasChildren(index, entry) ? "node" : "leaf"}
          label={entry.name}
          visual={Folder}
          isNavigatable
          isSelected={isSelected}
          onItemClick={() => onSelect(entry)}
          actions={metadata}
          areActionsFading={false}
        >
          {childEntries.map((child) => (
            <FileSystemTreeEntry
              key={child.path}
              entry={child}
              index={index}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpen={onOpen}
            />
          ))}
        </Tree.Item>
      </div>
    );
  }

  return (
    <div onDoubleClick={() => onOpen(entry)}>
      <Tree.Item
        type="leaf"
        label={entry.name}
        visual={File01}
        isNavigatable
        isSelected={isSelected}
        onItemClick={() => onSelect(entry)}
        actions={metadata}
        areActionsFading={false}
      />
    </div>
  );
}

// ─── Columns view ─────────────────────────────────────────────────────────────

function FileSystemColumnsView(props: FileSystemViewProps) {
  const {
    currentPath,
    index,
    loadPreviewImageUrl,
    loadingFolders,
    onOpen,
    onSelect,
    renderFilePreview,
    selectedEntry,
    selectedPath,
  } = props;
  const scrollContainerRef = React.useRef<HTMLDivElement | null>(null);
  const rowRefs = React.useRef(new Map<string, HTMLButtonElement>());

  const deferredSelectedEntry = React.useDeferredValue(selectedEntry);
  const deferredSelectedPath = React.useDeferredValue(selectedPath);
  const pendingFocusPathRef = React.useRef<string | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!ARROW_KEYS.has(event.key)) return;
    let nextEntry: FileSystemEntry | null | undefined;

    if (!selectedEntry || !selectedPath?.startsWith(currentPath)) {
      nextEntry = index.children.get(currentPath)?.[0];
    } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      const siblings = index.children.get(selectedEntry.parentPath) ?? [];
      const currentIndex = siblings.findIndex(
        (sibling) => sibling.path === selectedEntry.path
      );
      nextEntry =
        siblings[currentIndex + (event.key === "ArrowUp" ? -1 : 1)];
    } else if (event.key === "ArrowLeft") {
      if (selectedEntry.parentPath !== currentPath) {
        nextEntry = index.folders.get(selectedEntry.parentPath);
      }
    } else if (selectedEntry.kind === "folder") {
      nextEntry = index.children.get(selectedEntry.path)?.[0];
    }

    if (!nextEntry) return;
    onSelect(nextEntry);

    const row = rowRefs.current.get(nextEntry.path);
    if (row) {
      pendingFocusPathRef.current = null;
      row.focus();
    } else {
      pendingFocusPathRef.current = nextEntry.path;
    }
    event.preventDefault();
  };

  React.useEffect(() => {
    const path = pendingFocusPathRef.current;
    if (!path) return;
    const row = rowRefs.current.get(path);
    if (row) {
      pendingFocusPathRef.current = null;
      row.focus();
    }
  });

  const columnPaths = React.useMemo(() => {
    const paths = [currentPath];
    if (!deferredSelectedPath?.startsWith(currentPath)) return paths;
    const targetFolder =
      deferredSelectedEntry?.kind === "folder"
        ? deferredSelectedEntry.path
        : (deferredSelectedEntry?.parentPath ?? currentPath);
    const relativePath = targetFolder.slice(currentPath.length);
    let walkedPath = currentPath;
    for (const segment of relativePath.split("/")) {
      if (!segment) continue;
      walkedPath = `${walkedPath}${segment}/`;
      paths.push(walkedPath);
    }
    return paths;
  }, [currentPath, deferredSelectedEntry, deferredSelectedPath]);

  const columnPathSet = React.useMemo(
    () => new Set(columnPaths),
    [columnPaths]
  );
  const tabStopPath = React.useMemo(() => {
    if (selectedPath) {
      for (const columnPath of columnPaths) {
        if (
          index.children
            .get(columnPath)
            ?.some((entry) => entry.path === selectedPath)
        ) {
          return selectedPath;
        }
      }
    }
    return index.children.get(columnPaths[0] ?? "")?.[0]?.path ?? null;
  }, [columnPaths, index, selectedPath]);

  const selectedFile =
    deferredSelectedEntry?.kind === "file"
      ? (deferredSelectedEntry as FileEntry)
      : null;
  const selectedFileSize = selectedFile
    ? formatByteSize(selectedFile.size)
    : null;

  React.useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) container.scrollLeft = container.scrollWidth;
  }, [columnPaths.length, deferredSelectedPath]);

  return (
    <ScrollArea
      orientation="horizontal"
      viewportRef={scrollContainerRef}
      viewportClassName="s-overscroll-x-contain"
    >
      <div
        className="s-flex s-h-full s-w-max s-min-w-full"
        onKeyDown={handleKeyDown}
      >
        {columnPaths.map((columnPath) => (
          <ScrollArea
            key={columnPath || "(root)"}
            orientation="vertical"
            className="s-w-60 s-shrink-0 s-border-r s-border-border dark:s-border-border-night"
            viewportClassName="s-flex s-flex-col s-gap-px s-p-1.5"
          >
            <div role="listbox" aria-label="Files">
              {loadingFolders.has(columnPath) &&
              !index.children.get(columnPath)?.length ? (
                <div className="s-animate-pulse s-px-2 s-py-1.5 s-text-xs s-text-muted-foreground motion-reduce:s-animate-none dark:s-text-muted-foreground-night">
                  Loading…
                </div>
              ) : (
                (index.children.get(columnPath) ?? []).map((entry) => {
                  const isSelected = entry.path === selectedPath;
                  const isOnTrail =
                    entry.kind === "folder" && columnPathSet.has(entry.path);
                  const coverUrl =
                    entry.kind === "file"
                      ? filePreviewUrls(entry)[0]
                      : undefined;

                  return (
                    <button
                      key={entry.path}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={entry.path === tabStopPath ? 0 : -1}
                      ref={(element) => {
                        if (element) {
                          rowRefs.current.set(entry.path, element);
                        } else {
                          rowRefs.current.delete(entry.path);
                        }
                      }}
                      onClick={() => onSelect(entry)}
                      onDoubleClick={() => onOpen(entry)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") onOpen(entry);
                      }}
                      className={cn(
                        "s-flex s-shrink-0 s-items-center s-gap-2 s-rounded-md s-px-2 s-py-1 s-text-left s-text-sm s-outline-none focus-visible:s-ring-2",
                        isSelected
                          ? "s-bg-primary s-text-primary-foreground dark:s-bg-primary-night dark:s-text-primary-foreground-night"
                          : isOnTrail
                            ? "s-bg-primary-100 dark:s-bg-primary-100-night"
                            : "hover:s-bg-primary-100/50 dark:hover:s-bg-primary-100-night/50"
                      )}
                    >
                      {entry.kind === "folder" ? (
                        <FileSystemFolderGlyph className="s-h-3.5 s-w-auto s-shrink-0" />
                      ) : coverUrl ? (
                        <img
                          src={coverUrl}
                          alt=""
                          draggable={false}
                          className="s-size-4 s-shrink-0 s-rounded-[3px] s-bg-white s-object-cover"
                        />
                      ) : (
                        <File01
                          className={cn(
                            "s-size-4 s-shrink-0",
                            !isSelected &&
                              "s-text-muted-foreground dark:s-text-muted-foreground-night"
                          )}
                        />
                      )}
                      <span className="s-min-w-0 s-flex-1 s-truncate">
                        {entry.name}
                      </span>
                      {entry.kind === "folder" &&
                      folderHasChildren(index, entry) ? (
                        <ArrowRight
                          className={cn(
                            "s-size-3.5 s-shrink-0",
                            !isSelected &&
                              "s-text-muted-foreground/60 dark:s-text-muted-foreground-night/60"
                          )}
                        />
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </ScrollArea>
        ))}
        {selectedFile ? (
          <ScrollArea
            orientation="vertical"
            className="s-min-w-72 s-flex-1"
            viewportClassName="s-flex s-justify-center s-p-4"
          >
            <div className="s-flex s-w-full s-max-w-lg s-flex-col s-items-stretch s-gap-3">
              <div
                className="s-mx-auto s-w-full s-shrink-0"
                style={{
                  maxWidth: `min(100%, ${(selectedFile.previewAspectRatio ?? 0.78) * 20}rem)`,
                }}
              >
                <FileVisual
                  file={selectedFile}
                  className="s-w-full"
                  loadPreviewImageUrl={loadPreviewImageUrl}
                  pageable
                  previewAspectRatio={0.78}
                  renderFilePreview={renderFilePreview}
                />
              </div>
              <div className="s-text-center">
                <div className="s-text-sm s-font-semibold s-break-words">
                  {selectedFile.name}
                </div>
                <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {fileKindLabel(selectedFile)}
                  {selectedFileSize ? ` - ${selectedFileSize}` : null}
                </div>
              </div>
              <FileSystemInformation entry={selectedFile} index={index} />
            </div>
          </ScrollArea>
        ) : null}
      </div>
    </ScrollArea>
  );
}

// ─── Gallery view ─────────────────────────────────────────────────────────────

function FileSystemGalleryView(props: FileSystemViewProps) {
  const {
    entries,
    getFileUrl,
    index,
    loadPreviewImageUrl,
    onOpen,
    onSelect,
    renderFilePreview,
    selectedEntry,
    selectedPath,
  } = props;
  const stripRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const activeEntry =
    selectedEntry && entries.some((entry) => entry.path === selectedEntry.path)
      ? selectedEntry
      : (entries[0] ?? null);
  const activeFile = activeEntry?.kind === "file" ? activeEntry : null;

  const settledPath = useSettledValue(activeEntry?.path ?? null, 200);
  const isSettled = settledPath === (activeEntry?.path ?? null);
  const { isResolving, url: activeFileUrl } = useResolvedFileUrl(
    isSettled ? activeFile : null,
    getFileUrl
  );
  const isStageLoading =
    activeFile !== null && (!isSettled || (activeFileUrl === null && isResolving));
  const activeFileSize = activeFile ? formatByteSize(activeFile.size) : null;

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (entries.length === 0) return;
    const currentIndex = activeEntry
      ? entries.findIndex((entry) => entry.path === activeEntry.path)
      : -1;
    const nextEntry =
      entries[
        currentIndex === -1
          ? 0
          : currentIndex + (event.key === "ArrowLeft" ? -1 : 1)
      ];
    if (!nextEntry) return;
    onSelect(nextEntry);
    stripRefs.current.get(nextEntry.path)?.focus();
    event.preventDefault();
  };

  return (
    <div className="s-flex s-size-full s-flex-col" onKeyDown={handleKeyDown}>
      {/* Filmstrip — first in DOM so it's the single tab stop (Shift+Tab exits to toolbar). */}
      <ScrollArea
        orientation="horizontal"
        className="s-order-last s-h-auto s-w-full s-shrink-0 s-border-t s-border-border dark:s-border-border-night"
      >
        <div
          role="listbox"
          aria-label="Files"
          className="s-flex s-w-max s-min-w-full s-items-center s-gap-1.5 s-p-2"
        >
          {entries.map((entry) => {
            const isActive =
              entry.path === (activeEntry?.path ?? selectedPath);
            return (
              <button
                key={entry.path}
                type="button"
                role="option"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                ref={(element) => {
                  if (element) {
                    stripRefs.current.set(entry.path, element);
                  } else {
                    stripRefs.current.delete(entry.path);
                  }
                }}
                onClick={() => onSelect(entry)}
                onDoubleClick={() => onOpen(entry)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onOpen(entry);
                }}
                title={entry.name}
                className={cn(
                  "s-flex s-size-14 s-shrink-0 s-items-center s-justify-center s-rounded-md s-border s-border-transparent s-p-1 s-outline-none focus-visible:s-ring-2",
                  isActive &&
                    "s-border-border s-bg-primary-100 dark:s-border-border-night dark:s-bg-primary-100-night"
                )}
              >
                {entry.kind === "folder" ? (
                  <FileSystemFolderGlyph className="s-h-9 s-w-auto" />
                ) : (
                  <FileVisual
                    file={entry}
                    className="s-w-9 s-rounded-sm"
                    previewAspectRatio={0.78}
                    renderFilePreview={renderFilePreview}
                  />
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>
      <div className="s-flex s-min-h-0 s-flex-1">
        <div className="s-flex s-min-h-0 s-min-w-0 s-flex-1 s-items-center s-justify-center s-p-3">
          {activeEntry ? (
            activeEntry.kind === "folder" ? (
              <FileSystemFolderGlyph className="s-h-40 s-max-h-full s-w-auto s-drop-shadow-md" />
            ) : isStageLoading ? (
              <Spinner size="sm" />
            ) : activeFile && activeFileUrl ? (
              // Show image inline; other file types require onFileOpen or open in new tab.
              activeFile.contentType?.startsWith("image/") ? (
                <img
                  src={activeFileUrl}
                  alt={activeFile.name}
                  className="s-max-h-full s-max-w-full s-rounded-lg s-object-contain"
                />
              ) : (
                <FileVisual
                  file={activeFile}
                  className="s-w-56 s-max-w-full"
                  loadPreviewImageUrl={loadPreviewImageUrl}
                  pageable
                  previewAspectRatio={0.78}
                  renderFilePreview={renderFilePreview}
                />
              )
            ) : (
              activeFile && (
                <FileVisual
                  file={activeFile}
                  className="s-w-56 s-max-w-full"
                  loadPreviewImageUrl={loadPreviewImageUrl}
                  pageable
                  previewAspectRatio={0.78}
                  renderFilePreview={renderFilePreview}
                />
              )
            )
          ) : null}
        </div>
        {activeEntry ? (
          <ScrollArea
            orientation="vertical"
            className="s-hidden s-w-64 s-shrink-0 s-border-l s-border-border sm:s-block dark:s-border-border-night"
            viewportClassName="s-flex s-flex-col s-gap-3 s-p-4"
          >
            <div className="s-flex s-items-center s-gap-3">
              {activeFile ? (
                <FileVisual
                  file={activeFile}
                  className={cn(
                    "s-shrink-0 s-rounded-sm",
                    (activeFile.previewAspectRatio ?? 0.78) > 1.2
                      ? "s-w-16"
                      : "s-w-9"
                  )}
                  previewAspectRatio={0.78}
                  renderFilePreview={renderFilePreview}
                />
              ) : (
                <FileSystemFolderGlyph className="s-h-8 s-w-auto s-shrink-0" />
              )}
              <div className="s-min-w-0 s-flex-1">
                <div className="s-text-sm s-font-semibold s-break-words">
                  {activeEntry.name}
                </div>
                <div className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {activeFile ? fileKindLabel(activeFile) : "Folder"}
                  {activeFileSize ? ` - ${activeFileSize}` : null}
                </div>
              </div>
            </div>
            <FileSystemInformation entry={activeEntry} index={index} />
          </ScrollArea>
        ) : null}
      </div>
    </div>
  );
}

// ─── Information panel ────────────────────────────────────────────────────────

function FileSystemInformation({
  entry,
  index,
}: {
  entry: FileSystemEntry;
  index: FileSystemIndex;
}) {
  const rows: Array<[string, string]> = [];
  const created = formatTimestamp(entry.createdAt);
  const updated = formatTimestamp(entry.updatedAt);

  if (created) rows.push(["Created", created]);
  if (updated) rows.push(["Modified", updated]);
  if (entry.kind === "file") {
    const size = formatByteSize(entry.size);
    if (size) rows.push(["Size", size]);
  } else {
    const childCount = index.children.get(entry.path)?.length;
    if (childCount !== undefined) {
      rows.push(["Items", `${childCount}`]);
    }
  }

  if (rows.length === 0) return null;

  return (
    <div className="s-border-t s-border-border s-pt-3 dark:s-border-border-night">
      <div className="s-mb-1.5 s-text-xs s-font-semibold">Information</div>
      <dl className="s-space-y-1">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="s-flex s-items-baseline s-justify-between s-gap-3 s-text-xs"
          >
            <dt className="s-shrink-0 s-text-muted-foreground dark:s-text-muted-foreground-night">
              {label}
            </dt>
            <dd className="s-text-right" suppressHydrationWarning>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function FileSystem({
  items,
  className,
  title = "Files",
  defaultView = "icons",
  view: viewProp,
  onViewChange,
  defaultPath = "",
  onSelectionChange,
  onFileOpen,
  getFileUrl,
  loadChildren,
  loadPreviewImageUrl,
  renderFilePreview,
}: FileSystemProps) {
  const [internalView, setInternalView] = React.useState(defaultView);
  const view = viewProp ?? internalView;
  const setView = React.useCallback(
    (nextView: FileSystemView) => {
      setInternalView(nextView);
      onViewChange?.(nextView);
    },
    [onViewChange]
  );

  const [loadedItems, setLoadedItems] = React.useState<FileSystemItem[]>([]);
  const allItems = React.useMemo(
    () => (loadedItems.length ? [...items, ...loadedItems] : items),
    [items, loadedItems]
  );
  const index = React.useMemo(() => buildFileSystemIndex(allItems), [allItems]);

  const [history, setHistory] = React.useState(() => ({
    index: 0,
    stack: [normalizeFolderPath(defaultPath)],
  }));
  const currentPath = history.stack[history.index] ?? "";
  const canGoBack = history.index > 0;
  const canGoForward = history.index < history.stack.length - 1;

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const selectedEntry = React.useMemo(() => {
    if (selectedPath === null) return null;
    return (
      index.files.get(selectedPath) ??
      index.folders.get(selectedPath) ??
      null
    );
  }, [index, selectedPath]);

  const selectEntry = React.useCallback(
    (entry: FileSystemEntry | null) => {
      setSelectedPath(entry?.path ?? null);
      onSelectionChange?.(entry);
    },
    [onSelectionChange]
  );

  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const requestedFoldersRef = React.useRef(new Set<string>());
  const [loadingFolders, setLoadingFolders] = React.useState<Set<string>>(
    () => new Set()
  );

  const ensureChildren = React.useCallback(
    (folderPath: string) => {
      if (!loadChildren) return;
      const folder = index.folders.get(folderPath);
      if (!folder?.hasChildren) return;
      if (index.children.get(folderPath)?.length) return;
      if (requestedFoldersRef.current.has(folderPath)) return;

      requestedFoldersRef.current.add(folderPath);
      setLoadingFolders((previous) => new Set(previous).add(folderPath));

      void (async () => {
        try {
          let cursor: string | null = null;
          do {
            const result = await loadChildren({ cursor, path: folderPath });
            if (result.items.length) {
              setLoadedItems((previous) => [...previous, ...result.items]);
            }
            cursor = result.nextCursor ?? null;
          } while (cursor);
        } catch {
          requestedFoldersRef.current.delete(folderPath);
        } finally {
          setLoadingFolders((previous) => {
            const next = new Set(previous);
            next.delete(folderPath);
            return next;
          });
        }
      })();
    },
    [index, loadChildren]
  );

  const navigateTo = React.useCallback(
    (folderPath: string) => {
      const path = normalizeFolderPath(folderPath);
      setHistory((previous) => {
        if (previous.stack[previous.index] === path) return previous;
        const stack = [...previous.stack.slice(0, previous.index + 1), path];
        return { index: stack.length - 1, stack };
      });
      selectEntry(null);
      ensureChildren(path);
    },
    [ensureChildren, selectEntry]
  );

  React.useEffect(() => {
    ensureChildren(currentPath);
  }, [currentPath, ensureChildren]);

  const hasNavigatedRef = React.useRef(false);
  React.useEffect(() => {
    if (!hasNavigatedRef.current) {
      hasNavigatedRef.current = true;
      return;
    }
    const root = rootRef.current;
    if (root && document.activeElement === document.body) {
      root.focus();
    }
  }, [currentPath]);

  const openFile = React.useCallback(
    (file: FileEntry) => {
      void (async () => {
        let url = file.url ?? null;
        if (!url && getFileUrl) {
          try {
            url = await getFileUrl(file);
          } catch {
            url = null;
          }
        }
        if (onFileOpen) {
          onFileOpen(file, url);
          return;
        }
        if (url && typeof window !== "undefined") {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      })();
    },
    [getFileUrl, onFileOpen]
  );

  const openEntry = React.useCallback(
    (entry: FileSystemEntry) => {
      if (entry.kind === "folder") {
        navigateTo(entry.path);
      } else {
        openFile(entry);
      }
    },
    [navigateTo, openFile]
  );

  const selectAndPrefetchEntry = React.useCallback(
    (entry: FileSystemEntry | null) => {
      selectEntry(entry);
      if (entry?.kind === "folder") ensureChildren(entry.path);
    },
    [ensureChildren, selectEntry]
  );

  const goBack = React.useCallback(() => {
    setHistory((previous) => ({
      ...previous,
      index: Math.max(0, previous.index - 1),
    }));
    selectEntry(null);
  }, [selectEntry]);

  const goForward = React.useCallback(() => {
    setHistory((previous) => ({
      ...previous,
      index: Math.min(previous.stack.length - 1, previous.index + 1),
    }));
    selectEntry(null);
  }, [selectEntry]);

  const currentEntries = index.children.get(currentPath) ?? [];
  const currentFolderName =
    currentPath === "" ? title : pathName(currentPath) || title;
  const isLoadingCurrentFolder = loadingFolders.has(currentPath);

  const viewProps: FileSystemViewProps = {
    currentPath,
    entries: currentEntries,
    getFileUrl,
    index,
    loadPreviewImageUrl,
    loadingFolders,
    onOpen: openEntry,
    onSelect: selectAndPrefetchEntry,
    renderFilePreview,
    selectedEntry,
    selectedPath,
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={cn(
        "s-flex s-h-[480px] s-min-h-0 s-flex-col s-overflow-hidden s-rounded-xl s-border s-border-border s-bg-background s-text-foreground s-outline-none dark:s-border-border-night dark:s-bg-background-night dark:s-text-foreground-night",
        className
      )}
    >
      {/* Toolbar */}
      <div className="s-grid s-h-12 s-shrink-0 s-grid-cols-[1fr_auto_1fr] s-items-center s-gap-2 s-border-b s-border-border s-bg-muted-background s-px-2 dark:s-border-border-night dark:s-bg-muted-background-night">
        <div className="s-flex s-min-w-0 s-items-center s-gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            icon={ArrowLeft}
            disabled={!canGoBack}
            onClick={goBack}
            aria-label="Back"
            tooltip="Back"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            icon={ArrowRight}
            disabled={!canGoForward}
            onClick={goForward}
            aria-label="Forward"
            tooltip="Forward"
          />
          <span className="s-ml-1.5 s-truncate s-text-sm s-font-semibold">
            {currentFolderName}
          </span>
        </div>
        <Tabs
          value={view}
          onValueChange={(value) => setView(value as FileSystemView)}
          className="s-gap-0"
        >
          <TabsList className="s-h-8 s-p-0.5">
            {VIEW_OPTIONS.map((option) => (
              <TabsTrigger
                key={option.value}
                value={option.value}
                aria-label={`${option.label} view`}
                title={option.label}
                className="s-h-7 s-grow-0 s-px-2.5"
              >
                <option.icon className="s-size-4" />
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div />
      </div>

      {/* Content */}
      <div className="s-relative s-min-h-0 s-flex-1">
        {isLoadingCurrentFolder && currentEntries.length === 0 ? (
          <FileSystemEmptyState label="Loading…" isLoading />
        ) : currentEntries.length === 0 && view !== "columns" ? (
          <FileSystemEmptyState label="This folder is empty" />
        ) : view === "icons" ? (
          <FileSystemIconsView {...viewProps} />
        ) : view === "list" ? (
          <FileSystemListView {...viewProps} />
        ) : view === "columns" ? (
          <FileSystemColumnsView {...viewProps} />
        ) : (
          <FileSystemGalleryView {...viewProps} />
        )}
      </div>

      {/* Status bar */}
      <div
        aria-live="polite"
        className="s-flex s-h-7 s-shrink-0 s-items-center s-justify-center s-gap-1 s-border-t s-border-border s-bg-muted-background s-px-3 s-text-xs s-text-muted-foreground dark:s-border-border-night dark:s-bg-muted-background-night dark:s-text-muted-foreground-night"
      >
        <span>
          {currentEntries.length}{" "}
          {currentEntries.length === 1 ? "item" : "items"}
        </span>
        {selectedEntry ? (
          <span>· "{selectedEntry.name}" selected</span>
        ) : null}
      </div>
    </div>
  );
}

// Re-export XClose so callers can use it in onFileOpen dialogs they build themselves.
export { XClose as FileSystemCloseIcon };
