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
its first and last marked text, inside the formatting of the text it comments, as agents write
them, or inside the formatting both sides share when that Markdown would not read back the same,
so a bold or italic run crossing a comment's edge stays one run. Anchors meeting at one place keep the
order the file had them in; a new comment's anchors nest with their neighbours. A comment the
editor cannot highlight in full, such as one inside a link destination or starting or ending on
code, keeps the file read-only, since a save would drop or shrink it.

Pass `commentAuthor` to let the current user comment; without it, or read-only, comments stay
browsable. Selected text shows a Comment action, also reachable with Cmd/Ctrl+Alt+M, which
opens the panel on a new comment card at the text's place among the open threads. Posting,
replying, resolving and deleting stay out of text undo history. A message the codec cannot
write, such as one with a line starting with `::`, is refused before it reaches the document.
Message bodies show as plain text for now. The host renders authors' avatars through
`renderCommentAuthorAvatar`, which the panel calls only once it has been opened.

## Signatures

The editor never signs anything. With `signCommentMessage`, posting a comment or a reply asks the
server to write the message, with the user's name, the server's time and a signature, and the
editor inserts what it returns; a refusal keeps the typed text and shows the reason. Saving then
goes through the file API, which refuses a new message it did not sign for the saving user, or a
verified one moved within its thread (`front/lib/api/files/dfm_comment_signatures.ts`), and
never rewrites the file. Signatures bind the file's path and the message before each one, so a
renamed or moved file reads as unverified. With
`verifyCommentMessage`, the panel marks each message whose signature does not check out as
Unverified, such as one written from a sandbox or by an agent; without it, no message is
marked.

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
| `DocumentComments.ts` | The `comment` mark, the thread commands and the highlights. |
| `DocumentCommentAnchor.ts` | Anchor directives in Markdown, and anchors to marks and back. |
| `useDocumentComments.ts` | Comment state and actions for the components below. |
| `DocumentCommentsPanel.tsx`, `DocumentCommentInput.tsx`, `DocumentCommentMarkers.tsx` | The threads panel with the new comment card, the message field and the gutter markers. |

Tests: `dfm_persistence.test.ts` for the load and save boundary, `useDocumentEditor.test.ts`
for the save on unmount, `useDocumentComments.test.ts` for comments through the editor. The editor's interaction tests lived in Sparkle stories and are not
ported yet.
