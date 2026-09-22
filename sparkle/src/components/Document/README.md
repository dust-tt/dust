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
a new key to open a different document. Invalid stored JSON disables editing and
saving. The parser rejects unknown blocks, marks, fields and attributes instead
of dropping them. The same schema validates paste and browser saves. Ordinary typing
uses the editor schema without reparsing the complete document. Sources are limited to
512 KiB, 10,000 nodes and 64 levels of nesting.
Link destinations support HTTP, HTTPS, mailto, tel and relative URLs. Link styling,
targets and opener isolation belong to Document, including after an HTML paste.
Navigation protection and synchronization with external changes belong to the host.

`onPendingChangesChange(pending)` reports whether the editor has unsaved changes or
a save in flight. Hosts can use it to protect a draft before navigating away. Save
completion acknowledges only the submitted content, and an unmounted editor does
not notify its former host.

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

Markdown support is derived from the configured editor extensions. Loading is
conservative. Tables, images, task lists, HTML, reference definitions, escaped
punctuation, and tilde code fences are shown as their original read-only source
because the installed parser cannot reliably preserve them.
Supported input is also checked by serializing and parsing it again. Before a
Markdown save, the same check prevents a conversion from changing the draft's
content or formatting. Conversion failures preserve the draft and never call
`onSave`. These checks use the existing TipTap Markdown parser and serializer.

File access, version checks, and synchronization with agent edits belong to the host.

Stories and interaction tests live in `src/stories/Document.stories.tsx`,
`src/stories/DocumentMarkdown.stories.tsx`
and `src/stories/DocumentValidation.stories.tsx`. They cover formatting, block
commands, autosave, errors, concurrent edits, read-only content, themes, layout,
Markdown output, source preservation, content validation.

## Parsing outside React

`@dust-tt/sparkle/document` exports `parseDocumentContent` and
`serializeDocumentMarkdown` without importing React components or requiring a DOM.
Both ESM and CommonJS consumers use the editor's schema and validation. A failed
parse returns `{ ok: false, error }`. Markdown serialization returns `null` when
the document cannot be represented without losing content or formatting.
