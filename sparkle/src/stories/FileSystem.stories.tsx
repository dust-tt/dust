import type { Meta } from "@storybook/react";
import React, { useState } from "react";

import {
  FileSystem,
  type FileSystemFileItem,
  type FileSystemItem,
  type FileSystemView,
} from "@sparkle/components/FileSystem";
import { FileThumbnail } from "@sparkle/components/FileThumbnail";

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta = {
  title: "Components/FileSystem",
  component: FileSystem,
  parameters: {
    docs: {
      description: {
        component: `A macOS Finder-style file browser for flat file manifests. Supports four views — **Icons** (tile grid), **List** (tree with metadata columns), **Columns** (Miller columns with preview pane), and **Gallery** (filmstrip). Pass a flat array of \`FileSystemItem\` objects; folders are inferred automatically from file paths.

**When to use**
- To let users browse, navigate, and open files in a structured workspace.
- Pair with \`getFileUrl\` for presigned/signed URL resolution and \`loadChildren\` for lazy bucket traversal.
- Use \`onFileOpen\` to handle file opens in your own viewer dialog.

**Guidelines**
- Provide \`previewImageUrl\` on file items for thumbnail previews in all views.
- For multi-page documents, pass \`previewImageUrls\` (cover + pages) and \`loadPreviewImageUrl\` for on-demand page loading.
- Set \`hasChildren: true\` on folder items and provide \`loadChildren\` to paginate large directories.`,
      },
    },
  },
} satisfies Meta<typeof FileSystem>;

export default meta;

// ─── Sample data ──────────────────────────────────────────────────────────────

const SAMPLE_ITEMS: FileSystemItem[] = [
  // Top-level folders
  { kind: "folder", path: "invoices/", hasChildren: true },
  { kind: "folder", path: "contracts/" },
  { kind: "folder", path: "reports/" },

  // invoices/
  {
    kind: "file",
    path: "invoices/jan-2026.pdf",
    contentType: "application/pdf",
    size: 482_193,
    createdAt: "2026-01-04T10:02:00.000Z",
    updatedAt: "2026-01-04T10:02:00.000Z",
  },
  {
    kind: "file",
    path: "invoices/feb-2026.pdf",
    contentType: "application/pdf",
    size: 391_048,
    createdAt: "2026-02-03T09:15:00.000Z",
    updatedAt: "2026-02-03T09:15:00.000Z",
  },
  {
    kind: "file",
    path: "invoices/mar-2026.pdf",
    contentType: "application/pdf",
    size: 512_004,
    createdAt: "2026-03-05T14:30:00.000Z",
    updatedAt: "2026-03-05T14:30:00.000Z",
  },

  // contracts/
  {
    kind: "file",
    path: "contracts/acme-corp.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 128_512,
    updatedAt: "2025-11-20T16:00:00.000Z",
  },
  {
    kind: "file",
    path: "contracts/globex.docx",
    contentType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: 98_304,
    updatedAt: "2025-12-01T11:00:00.000Z",
  },

  // reports/
  {
    kind: "file",
    path: "reports/q1-summary.xlsx",
    contentType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    size: 256_000,
    updatedAt: "2026-04-01T08:00:00.000Z",
  },
  {
    kind: "file",
    path: "reports/logo.png",
    contentType: "image/png",
    size: 42_000,
    updatedAt: "2026-01-10T10:00:00.000Z",
  },

  // Top-level file
  {
    kind: "file",
    path: "readme.md",
    contentType: "text/markdown",
    size: 1_240,
    updatedAt: "2026-05-15T12:00:00.000Z",
  },
];

// ─── With thumbnails ──────────────────────────────────────────────────────────

// Placeholder thumbnail URLs using a public placeholder service.
const SAMPLE_ITEMS_WITH_THUMBNAILS: FileSystemItem[] = SAMPLE_ITEMS.map(
  (item) => {
    if (item.kind !== "file") return item;
    const isImage = item.contentType?.startsWith("image/");
    const isPdf = item.contentType === "application/pdf";
    const seed = item.path.length;
    return {
      ...item,
      previewImageUrl: isImage || isPdf ? undefined : undefined,
      previewAspectRatio: 0.78,
    };
  }
);

// ─── Stories ──────────────────────────────────────────────────────────────────

export const Default = () => (
  <div className="s-w-full s-max-w-3xl">
    <FileSystem items={SAMPLE_ITEMS} title="My Files" />
  </div>
);

export const ListView = () => (
  <div className="s-w-full s-max-w-3xl">
    <FileSystem items={SAMPLE_ITEMS} title="My Files" defaultView="list" />
  </div>
);

export const ColumnsView = () => (
  <div className="s-w-full s-max-w-3xl">
    <FileSystem items={SAMPLE_ITEMS} title="My Files" defaultView="columns" />
  </div>
);

export const GalleryView = () => (
  <div className="s-w-full s-max-w-3xl">
    <FileSystem items={SAMPLE_ITEMS} title="My Files" defaultView="gallery" />
  </div>
);

export const ControlledView = () => {
  const [view, setView] = useState<FileSystemView>("icons");
  return (
    <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-4">
      <p className="s-text-sm s-text-muted-foreground">
        Current view: <strong>{view}</strong>
      </p>
      <FileSystem
        items={SAMPLE_ITEMS}
        title="My Files"
        view={view}
        onViewChange={setView}
      />
    </div>
  );
};

export const WithSelectionCallback = () => {
  const [selected, setSelected] = useState<FileSystemItem | null>(null);
  return (
    <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-4">
      <p className="s-text-sm s-text-muted-foreground">
        Selected:{" "}
        <strong>
          {selected ? `${selected.kind} — ${selected.path}` : "none"}
        </strong>
      </p>
      <FileSystem
        items={SAMPLE_ITEMS}
        title="My Files"
        onSelectionChange={setSelected}
      />
    </div>
  );
};

export const WithOpenCallback = () => {
  const [opened, setOpened] = useState<string | null>(null);
  return (
    <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-4">
      <p className="s-text-sm s-text-muted-foreground">
        Last opened:{" "}
        <strong>{opened ?? "double-click a file to open it"}</strong>
      </p>
      <FileSystem
        items={SAMPLE_ITEMS}
        title="My Files"
        onFileOpen={(file: FileSystemFileItem, url) => {
          setOpened(`${file.path} (url: ${url ?? "none"})`);
        }}
      />
    </div>
  );
};

export const LazyLoading = () => {
  const [loadCount, setLoadCount] = useState(0);

  const loadChildren = async () => {
    // Simulate a 600ms fetch.
    await new Promise((resolve) => setTimeout(resolve, 600));
    setLoadCount((n) => n + 1);
    return {
      items: [
        {
          kind: "file" as const,
          path: "invoices/apr-2026.pdf",
          contentType: "application/pdf",
          size: 445_000,
          updatedAt: "2026-04-02T09:00:00.000Z",
        },
        {
          kind: "file" as const,
          path: "invoices/may-2026.pdf",
          contentType: "application/pdf",
          size: 388_000,
          updatedAt: "2026-05-01T10:00:00.000Z",
        },
      ],
    };
  };

  return (
    <div className="s-flex s-w-full s-max-w-3xl s-flex-col s-gap-4">
      <p className="s-text-sm s-text-muted-foreground">
        Lazy loads triggered: <strong>{loadCount}</strong>. Open the{" "}
        <em>invoices</em> folder in Columns view to trigger a fetch.
      </p>
      <FileSystem
        items={SAMPLE_ITEMS}
        title="My Files"
        defaultView="columns"
        loadChildren={loadChildren}
      />
    </div>
  );
};

export const CustomEmptyState = () => (
  <div className="s-w-full s-max-w-3xl">
    <FileSystem items={[]} title="Empty Bucket" />
  </div>
);

export const Tall = () => (
  <div className="s-w-full s-max-w-3xl">
    <FileSystem
      items={SAMPLE_ITEMS}
      title="My Files"
      className="s-h-[640px]"
    />
  </div>
);

// ─── FileThumbnail stories ─────────────────────────────────────────────────────

export const Thumbnails = () => (
  <div className="s-flex s-flex-wrap s-gap-4">
    <div className="s-w-32">
      <FileThumbnail
        file={{ name: "report.pdf", type: "application/pdf" }}
        previewImageUrl="https://via.placeholder.com/200x260/e2e8f0/64748b?text=PDF"
      />
      <p className="s-mt-1 s-text-xs s-text-center s-text-muted-foreground">
        With preview
      </p>
    </div>
    <div className="s-w-32">
      <FileThumbnail
        file={{ name: "photo.png", type: "image/png" }}
        previewImageUrl="https://via.placeholder.com/200x200/bfdbfe/1d4ed8?text=IMG"
        previewAspectRatio={1}
      />
      <p className="s-mt-1 s-text-xs s-text-center s-text-muted-foreground">
        Square image
      </p>
    </div>
    <div className="s-w-32">
      <FileThumbnail
        file={{ name: "unknown.bin", type: "application/octet-stream" }}
      />
      <p className="s-mt-1 s-text-xs s-text-center s-text-muted-foreground">
        No preview
      </p>
    </div>
    <div className="s-w-32">
      <FileThumbnail
        file={{ name: "loading.pdf", type: "application/pdf" }}
        isLoading
      />
      <p className="s-mt-1 s-text-xs s-text-center s-text-muted-foreground">
        Loading
      </p>
    </div>
    <div className="s-w-32">
      <FileThumbnail
        file={{ name: "broken.png", type: "image/png" }}
        hasError
      />
      <p className="s-mt-1 s-text-xs s-text-center s-text-muted-foreground">
        Error
      </p>
    </div>
    <div className="s-w-32">
      <FileThumbnail
        file={{ name: "slides.pptx", type: "application/vnd.ms-powerpoint" }}
        previewAspectRatio={16 / 9}
        previewImageUrl="https://via.placeholder.com/320x180/fef9c3/854d0e?text=PPTX"
      />
      <p className="s-mt-1 s-text-xs s-text-center s-text-muted-foreground">
        Landscape 16:9
      </p>
    </div>
  </div>
);
