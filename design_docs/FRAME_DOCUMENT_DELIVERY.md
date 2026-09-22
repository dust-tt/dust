# Editable documents inside Frames

Status: first delivery, without comments or live collaboration.

The product entry point is **Create Frames v2**. A Frame can present one continuous editable document with a model-authored theme and interactive visuals. The user and the agent work on the same native file. The longer-term goal is to keep reports, decisions and working documents in Dust alongside the agents and tools that produce them.

## Ownership

| Piece | Owner | Responsibility |
| --- | --- | --- |
| Rich-text editor | Sparkle | Formatting, selection controls, autosave and validation |
| Document schema | Sparkle's headless `document` entry | One parser for browser, API and sandbox |
| `DocumentRoot` | Viz | Bind a package file to the editor and resolve named React visuals |
| File authorization and persistence | Front and Files API | Canonical paths, mount permissions and conditional writes |
| Authoring recipe and checker | Create Frames v2 | Ordinary file edits, validation and existing Frame publication |

The headless entry avoids loading editor UI on the server. It creates an intentional dependency on Sparkle for the schema. Extracting a shared document package becomes worthwhile if that schema develops independent consumers or a release cadence separate from the editor.

## Stored content

A Frame owns `manifest.json`, `index.tsx` and a native sidecar such as `report.dustdoc`. The sidecar is versioned JSON with `format`, `formatVersion`, `schemaVersion` and TipTap `content`. It contains no executable code. A visual node stores only its name, for example `revenue`. The Frame supplies `<RevenueChart />` through `DocumentRoot`'s `visuals` property. This introduces no nested iframe.

The theme belongs to the Frame and accepts bounded presentation tokens. Sparkle owns the editing controls. The document's background covers the full canvas while prose uses the configured reading width.

The first slice does not add comment marks, threads, a separate comments file or a standalone document viewer. Existing PoC files containing comments are intentionally not migrated by this stack.

## Read and save

The private Frame host resolves a literal package-relative `.dustdoc` path inside the current Frame package. Front checks existing Files mount permissions and returns content with the GCS generation identifying those exact bytes. Autosave supplies that revision in `If-Match`, and storage applies it atomically. An invalid or stale write preserves the stored file and leaves the browser draft available.

Shared Frames use their existing asset cache read-only and cannot fall back to private document RPCs. Browser edits use the canonical file path. Publication continues to follow the existing Frame lifecycle.

An agent reads and edits the sidecar through the existing sandbox filesystem. Enabling Create Frames attaches the standalone checker and example under `skills/Create Frames/document/`. There is no separate document skill, per-document mount, save function or database to generate. The checker validates without executing Frame code or changing the input. Markdown conversion refuses unsupported content and existing destinations.

## Known limits and future work

Revision checks detect conflicts rather than merge edits. An open editor does not subscribe to external file updates. Users reopen to load the latest file, and agents must read current source before applying a targeted edit. Plain agent filesystem writes do not yet have the browser's conditional-write guarantee.

Native JSON retains structure needed for future comments and stable block identity. It is not a Yjs persistence format. Collaboration will require an explicit versioned storage and synchronization design, including how agent file edits become collaborative operations. No Yjs metadata is discarded or approximated in this release because none is created.

Comments, dedicated document sharing and export, collaborative editing, table improvements and a standalone document surface remain separate decisions.

## Review and deployment order

1. Shared editor validation and headless parser.
2. Bounded themes and named visual blocks.
3. Native file persistence through the Files API.
4. DocumentRoot and the authorized Frame bridge.
5. Create Frames authoring recipe, example and bundled checker.

The first branch starts from main. Subsequent branches are stacked so each review shows its own change. Publish Sparkle, deploy the Files API and Frame host, deploy Viz, then enable the authoring recipe. There is no database migration. Keep the running PoC worktree separate during review.
