# Document

Import `Document` and its `DocumentProps` / `DocumentSaveResult` types from
`@dust-tt/sparkle`. The component owns the editor, block menu, selection toolbar,
typography, and debounced save lifecycle.
Its scoped styles travel with the component; consumers do not need to import
Sparkle's global Tailwind stylesheet specifically for Document.

Pass `initialContent` as Markdown (the default) or serialized TipTap document JSON
with `contentType="json"`. Supply `onSave` to enable editing and persist the JSON
it receives. A save resolves to `{ ok: true }` only after persistence succeeds, or
`{ ok: false, error: string }` on failure. Without a callback, or with `readOnly`,
the document is read-only. Hosts must apply their authorization to `readOnly`.

Changes save after three idle seconds, or immediately with Cmd/Ctrl+S. Only one
request runs at a time. Failed saves preserve the draft and pause automatic retry
until Retry or Cmd/Ctrl+S. Later edits are not acknowledged by an earlier save.

`className` applies to the outer container. Typography and editor configuration
remain controlled by Document. Initial content is captured at mount; remount with
a new key to open a different document. Invalid stored JSON disables editing.
Navigation protection and synchronization with external changes belong to the host.

The component currently saves JSON, including when initialized with Markdown.
Automatic Markdown-file persistence remains a separate product-layer change.

Stories and interaction tests live in `src/stories/Document.stories.tsx`, under
Documents / Document. They cover formatting, block commands, autosave, errors,
concurrent edits, read-only content, themes, and outer layout styling.
