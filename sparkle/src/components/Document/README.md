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

`className` applies to the outer container. Typography layout and editor configuration
remain controlled by Document. Hosts may theme fonts and colors inside `.tiptap`,
the document content subtree. Editing controls stay outside that subtree and retain
Sparkle's theme. Initial content is captured at mount. Remount with a new key to
open a different document. Invalid stored JSON disables editing.
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

Markdown support is derived from the configured editor extensions. Loading is
conservative. Tables, images, task lists, HTML, reference definitions, escaped
punctuation, and tilde code fences are shown as their original read-only source
because the installed parser cannot reliably preserve them.
Supported input is also checked by serializing and parsing it again. Before a
Markdown save, the same check prevents a conversion from changing the draft's
content or formatting. Conversion failures preserve the draft and never call
`onSave`. These checks use the existing TipTap Markdown parser and serializer.

## Comments

Comments live inside the document JSON. Each thread is stored under the root node's
`attrs.comments` with its id, body, author, creation time, resolved flag and replies.
The commented text carries a `comment` mark holding only the thread id, so several
comments can overlap and a thread survives edits around it. Deleting a thread removes
its marks. Resolving keeps them so the thread can be reopened in place. Documents
whose stored comments do not match this shape do not open, like any invalid JSON.

Pass `commentAuthor` to let the current user comment. Commenting also requires an
editable document saved as JSON, since Markdown cannot carry comments. Selected text
shows a Comment action after the formatting controls, also reachable with
Cmd/Ctrl+Alt+M. The composer appears under the selection. Escape or clicking away
discards the draft.

Unresolved comments highlight their text and add a marker in the right gutter. Markers
on the same line merge and show a count. Clicking a highlight or a marker opens the
comments panel on that thread, cycling through overlapping comments. The Comments
button in the header opens the panel with every thread, resolved ones collapsed at the
end. Selecting a thread scrolls to its text and, for authors, shows the reply field.
Read-only documents and documents without `commentAuthor` keep comments browsable
without reply, resolve or delete controls. Comment changes go through the regular
autosave and undo history.

File access, version checks, and synchronization with agent edits belong to the
eventual host integration.

Stories and interaction tests live in `src/stories/Document.stories.tsx`,
`src/stories/DocumentMarkdown.stories.tsx`, `src/stories/DocumentVisuals.stories.tsx`
and `src/stories/DocumentComments.stories.tsx`. They cover formatting, block commands,
autosave, errors, concurrent edits, read-only content, themes, layout, Markdown
output, source preservation, visuals and comments.
