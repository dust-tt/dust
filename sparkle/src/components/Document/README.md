# Document

Import `Document` and its `DocumentProps` / `DocumentSaveResult` types from
`@dust-tt/sparkle`. The component owns the editor, block menu, selection toolbar,
typography, and debounced save lifecycle.
It uses Tailwind utilities and Sparkle tokens through the standard Sparkle
stylesheet, with no separate Document stylesheet.

Pass `initialContent` as Markdown (the default) or serialized TipTap document JSON
with `contentType="json"`. Supply `onSave` to enable editing. Saves return JSON by
default, independently of the input format. Set `saveFormat="markdown"` to receive
Markdown instead. A save resolves to `{ ok: true }` only after persistence succeeds, or
`{ ok: false, error: string }` on failure. Without a callback, or with `readOnly`,
the document is read-only. Hosts must apply their authorization to `readOnly`.
Changes to `readOnly` or the presence of `onSave` update editing permissions while
preserving the current draft.

Changes save after three idle seconds by default. Set `autosaveDebounceMs` to
adjust the delay, or use Cmd/Ctrl+S to save immediately. Only one request runs at
a time. Failed saves preserve the draft and pause automatic retry until Retry or
Cmd/Ctrl+S. Undoing back to saved content also clears the error without a request.
Later edits are not acknowledged by an earlier save. Parent renders and changes
to the save callback do not restart the debounce timer.

`className` applies to the outer container. Typography and editor configuration
remain controlled by Document. Initial content is captured at mount. Remount with
a new key to open a different document. Invalid stored JSON disables editing.
Navigation protection and synchronization with external changes belong to the host.

For a Markdown file, the host supplies persistence for the string it receives:

```tsx
<Document
  initialContent={markdown}
  saveFormat="markdown"
  onSave={saveMarkdown}
/>
```

Opening a document does not write or normalize its stored source. After an edit,
Markdown output preserves supported content and formatting, but may normalize
spacing, list markers, and emphasis delimiters. Empty trailing paragraphs are
omitted. Dirty state is tracked separately from the serialized output so a
successful Markdown save acknowledges the same draft as a JSON save.

Markdown support is derived from the configured editor extensions. A top-level
block the editor cannot represent, such as a table, an image, a task list, raw HTML, a
reference definition, escaped punctuation, or a tilde code fence, loads as a read-only
source block showing its original Markdown. The block can be selected and deleted, and
saving writes its source back verbatim while the surrounding content stays editable.
Supported input is also checked by serializing and parsing it again. Markdown that
still cannot be reopened unchanged is shown as its original read-only source. Before a
Markdown save, the same check prevents a conversion from changing the draft's
content or formatting. Conversion failures preserve the draft and never call
`onSave`. These checks use the existing TipTap Markdown parser and serializer.

File access, version checks, and synchronization with agent edits belong to the
eventual host integration.

Stories and interaction tests live in `src/stories/Document.stories.tsx` and
`src/stories/DocumentMarkdown.stories.tsx`. They cover formatting, block commands,
autosave, errors, concurrent edits, read-only content, themes, layout, Markdown
output, and source preservation.
