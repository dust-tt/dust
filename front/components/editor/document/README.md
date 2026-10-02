# Document

The rich editor for Dust Docs: `.md` files in DFM, the Dust-Flavored Markdown format defined in
`front/lib/markdown/dfm`. The component owns the TipTap editor, the slash block menu, the
selection toolbar, typography and the autosave lifecycle. Hosts own file access, permissions and
synchronization with other writers.

It started as a copy of Sparkle's `Document`, which Frames used with TipTap JSON files. This
copy persists DFM only. Comments, suggestions and named visual blocks are not here yet;
comments come in the next pull request.

## Usage

```tsx
<Document initialContent={dfmSource} onSave={persistDfmSource} />
```

`initialContent` is the file's DFM source and is captured at mount: remount with a new key to
open another file. `onSave` receives the DFM source to persist and resolves `{ ok: true }` once
stored, or `{ ok: false, error }`. Without `onSave`, or with `readOnly`, the document is
read-only. Hosts apply their authorization through `readOnly`.

Changes save after three idle seconds, or at once with Cmd/Ctrl+S. One save runs at a time.
Failed saves keep the draft and pause automatic retries until Retry or Cmd/Ctrl+S. Undoing back
to the saved content clears the error without a request.

## What opens

`loadDfm` in `dfm_persistence.ts` decides. Hosts mount the editor for every Markdown file
they hand it; a file opens for editing when it is valid DFM, its body has no comment anchors,
and its body is Markdown the editor reproduces. Tables, images, task lists, HTML, reference
links and tilde fences are refused for now, since the TipTap Markdown parser cannot preserve
them. A refused file is shown as read-only source with the reason. Line endings are not
preserved: a CRLF file opens and is written back with LF.

Hosts hold close and navigation while an edit is unsaved, through `onStateChange`, and lift the
hold once a save has failed and the user has seen it. Any other unmount with unsaved content
queues one last save behind the save in flight.

Front matter and comment threads already in the file are kept in an envelope and written back
unchanged on save. The editor only rewrites the body, and only when the codec confirms the
result reads back identically.

## Layout

| File | Owns |
| --- | --- |
| `index.tsx` | The component: layout, shortcuts, read-only and unsupported states. |
| `useDocumentEditor.ts` | The TipTap editor, dirty tracking, autosave and the save lifecycle. |
| `dfm_persistence.ts` | `loadDfm` and `saveDfm`, between DFM source and the editor's document. |
| `content.ts` | Markdown parse and serialize for the body, with the round-trip checks. |
| `extensions.ts` | The schema: StarterKit, Markdown, placeholders and heading anchors. |
| `blocks.ts`, `DocumentBlockMenu.tsx` | The `/` block menu. |
| `DocumentSelectionToolbar.tsx` | Formatting controls on a text selection. |
| `DocumentSaveStatus.tsx` | Saved, saving, unsaved and error line with Retry. |
| `DocumentSourcePreview.tsx` | Read-only source for a file that cannot open. |
| `DocumentAnchors.ts` | In-document heading links. |

Tests: `dfm_persistence.test.ts` for the load and save boundary. The editor's interaction tests
lived in Sparkle stories and are not ported yet.
