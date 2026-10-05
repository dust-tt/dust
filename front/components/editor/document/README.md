# Document

The rich editor for Dust Docs: `.md` files in DFM, the Dust-Flavored Markdown format defined in
`front/lib/markdown/dfm`. The component owns the TipTap editor, the slash block menu, the
selection toolbar, typography and the autosave lifecycle. Hosts own file access, permissions and
synchronization with other writers.

It started as a copy of Sparkle's `Document`, which Frames used with TipTap JSON files. This
copy persists DFM only. Suggestions and named visual blocks are not here yet.

## Usage

```tsx
<Document initialContent={dfmSource} onSave={persistDfmSource} />
```

`initialContent` is the file's DFM source and is captured at mount: remount with a new key to
open another file. `onSave` receives the DFM source to persist and resolves `Ok` once
stored, or `Err` with a message. Without `onSave`, or with `readOnly`, the document is
read-only. Hosts apply their authorization through `readOnly`.

Changes save after three idle seconds, or at once with Cmd/Ctrl+S. One save runs at a time.
Failed saves keep the draft and pause automatic retries until Retry or Cmd/Ctrl+S. Undoing back
to the saved content clears the error without a request.

## What opens

`loadDfm` in `dfm_persistence.ts` decides. Hosts mount the editor for every Markdown file
they hand it; a file opens for editing when it is valid DFM, its body is Markdown the editor
reproduces, and every comment anchor the codec reads is one the editor can highlight. Tables, images, task lists, HTML, reference
links and tilde fences are refused for now, since the TipTap Markdown parser cannot preserve
them. A refused file is shown as read-only source with the reason. Line endings are not
preserved: a CRLF file opens and is written back with LF.

Hosts hold close and navigation while an edit is unsaved, through `onStateChange`, and lift the
hold once a save has failed and the user has seen it. Unmounting with unsaved content, after
a failed save included, queues one last save behind the save in flight.

Front matter is kept in an envelope and written back unchanged on save. The editor rewrites
the body and the comment threads, and only when the codec confirms the result reads back
identically.

## Comments

Comments are the DFM threads of the file. On load, the Markdown parser reads each anchor
directive as a `commentAnchor` node, and `anchorsToMarks` turns every pair into a `comment` mark
on the text between them; the threads go in the document's `comments` attribute, so dirty
tracking and autosave cover them. On save, `marksToAnchors` writes one pair per comment around
its first and last marked text, inside the formatting the text on both sides shares, so a bold
or italic run crossing a comment's edge stays one run. A comment the editor cannot highlight,
such as one inside a link destination or covering only code, keeps the file read-only.

Comments are browsable through their highlights, the gutter markers and the panel; writing
them comes in the next pull request. Message bodies show as plain text for now.

## Layout

| File | Owns |
| --- | --- |
| `Document.tsx` | The component: layout, shortcuts, read-only and unsupported states. |
| `index.ts` | The public surface: `Document` and its types. |
| `useDocumentEditor.ts` | The TipTap editor, dirty tracking, autosave and the save lifecycle. |
| `dfm_persistence.ts` | `loadDfm` and `saveDfm`, between DFM source and the editor's document. |
| `content.ts` | Markdown parse and serialize for the body, with the round-trip checks. |
| `extensions.ts` | The schema: StarterKit, Markdown, placeholders and heading anchors. |
| `blocks.ts`, `DocumentBlockMenu.tsx` | The `/` block menu. |
| `DocumentSelectionToolbar.tsx` | Formatting controls on a text selection. |
| `DocumentSaveStatus.tsx` | The status row, the save status with Retry, and the save error under it. |
| `DocumentSourcePreview.tsx` | Read-only source for a file that cannot open. |
| `DocumentAnchors.ts` | In-document heading links. |
| `DocumentComments.ts` | The `comment` mark, the threads attribute and the highlights. |
| `DocumentCommentAnchor.ts` | Anchor directives in Markdown, and anchors to marks and back. |
| `useDocumentComments.ts` | Comment state and actions for the components below. |
| `DocumentCommentsPanel.tsx`, `DocumentCommentMarkers.tsx` | The threads panel and the gutter markers. |

Tests: `dfm_persistence.test.ts` for the load and save boundary, `useDocumentEditor.test.ts`
for the save on unmount, `useDocumentComments.test.ts` for comments through the editor. The editor's interaction tests lived in Sparkle stories and are not
ported yet.
