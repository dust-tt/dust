# Document

The rich editor for Dust Docs: `.md` files in DFM, the Dust-Flavored Markdown format defined in
`front/lib/markdown/dfm`. The component owns the TipTap editor, the slash block menu, the
selection toolbar and typography. Hosts own file access, permissions and the live session.

It started as a copy of Sparkle's `Document`, which Frames used with TipTap JSON files. This
copy persists DFM only. Suggestions and named visual blocks are not here yet.

## Usage

```tsx
<DocumentEditor initialContent={dfmSource} live={liveSession} />
```

`initialContent` is the file's DFM source and is captured at mount: remount with a new key to
open another file. With `live`, the document is edited with everyone else in the session, which
stores every edit; without it, or with `readOnly`, the document is read-only. Hosts apply their
authorization through `readOnly`.

The connection status and the comments button show in a row above the document that stays in
view while it scrolls. Pass `headerControlsContainer`, such as
an element in the host's header bar, to show the comments button there instead.

## What opens

`loadDfm` in `dfm_persistence.ts` decides. Hosts mount the editor for every Markdown file
they hand it; a file opens for editing when it is valid DFM, its body is Markdown the editor
reproduces, and every comment anchor the codec reads is one the editor can highlight. Task lists, HTML, reference links
and tilde fences are refused for now, since the TipTap Markdown parser cannot preserve
them. A refused file is shown as read-only source with the reason. Line endings are not
preserved: a CRLF file opens and is written back with LF.

## Tables

A GFM table opens as a table whose first row is its header, at the top level, in a list item or
in a quote. Each cell holds one paragraph of text, so Enter does nothing in a cell. Saving
writes compact rows, `| a | b |` with `---`, `:--`, `:-:` or `--:` per column as the table
aligns it, and every `|` in a cell escaped, a `|` inside code included. Comments may sit in a
cell, span cells in reading order, or surround a table. A table is refused when a row has more
cells than its header, since marked would drop them.

Front matter is kept in an envelope and written back unchanged on save. The editor rewrites
the body and the comment threads, and only when the codec confirms the result reads back
identically.

## Comments

Comments are the DFM threads of the file. On load, the Markdown parser reads each anchor
directive as a `commentAnchor` node, and `anchorsToMarks` turns every pair into a `comment` mark
on the text between them; the threads go in the document's `comments` attribute. On save, `marksToAnchors` writes one pair per comment around
its first and last marked text, inside the formatting of the text it comments, as agents write
them, or inside the formatting both sides share when that Markdown would not read back the same,
so a bold or italic run crossing a comment's edge stays one run. Anchors meeting at one place keep the
order the file had them in; a new comment's anchors nest with their neighbours. A comment the
editor cannot highlight in full, such as one inside a link destination or starting or ending on
code, keeps the file read-only, since a save would drop or shrink it.

Pass `commentAuthor` to let the current user comment; without it, or read-only, comments stay
browsable. Selected text shows a Comment action, also reachable with Cmd/Ctrl+Alt+M, which
opens a new comment card floating under the text. Clicking a highlight or its margin marker floats
its thread in a card under the text; the comments button above the document opens a list of every
thread, pinned at the top right, where the picked thread unfolds in place. Posting,
replying, resolving and deleting stay out of text undo history. A message the codec cannot
write, such as one with a line starting with `::`, is refused before it reaches the document.
The host renders message bodies through `renderCommentBody`, and authors' avatars through
`renderCommentAuthorAvatar`, called only for threads shown in the card or the list.

## Mentions

Message bodies are Markdown, and the file preview's `renderCommentBody` shows agent and user
mention directives in them as mention chips. When a comment posted in the live session mentions
agents or users, the collab server hands it to a Temporal job
(`front/lib/api/documents/comment_mentions.ts`, `mentions_queue`), keyed by the document and
the message so it is posted once. The job posts it as a user message in the document's
conversation, waiting while an agent runs there: the file's own conversation, or for a pod file
a conversation created in the pod on first use and found again by path. Mentioned agents then
answer there and mentioned users are notified, as for any conversation message.

The new comment and reply fields are small TipTap editors whose content is submitted as Markdown.
With `commentInputExtensions`, the host adds extensions to them; the file preview adds the
conversation input's mention extension, so typing `@` picks an agent or a user and shows it as
a chip.

## Signatures

The editor never signs anything. Comments are posted through the live session, whose server writes
each message with the user's name, the server's time and a signature; a refusal keeps the typed
text and shows the reason. A save through the file API refuses a new message the server did not
sign for the saving user, or a verified one moved within its thread
(`front/lib/api/documents/comment_signatures.ts`), and never rewrites the file. Signatures bind the file's path and the message before each one, so a
renamed or moved file reads as unverified. A comment an agent posts with `documents.add_comment`
is signed by the server for that agent (`front/lib/api/documents/agent_comments.ts`). With
`verifyCommentMessage`, threads mark each message whose signature does not check out as
Unverified, such as one written from a sandbox or by an agent editing the file directly; without
it, no message is marked.

## Suggestions

A message can suggest new wording for the commented text, in a `suggestion` block as on
GitHub (see the DFM README). A thread shows the commented text as it is now next to the
suggested text. Suggest, in the new comment and reply fields, adds a block holding the commented
text as Markdown, shown as a suggested change and selected so typing replaces it. Apply
replaces the commented text, which keeps the comment, and resolves the thread; the text change
is undoable, the resolution stays out of history. A suggestion applies only to a comment within one paragraph, heading or list item, and
only when it is one paragraph of text: anything else is refused with the reason.

## Images

An image is ordinary Markdown, `![alt](destination "title")`, read as an inline `image` node that
keeps its alt text, destination and title as written. The editor loads nothing by itself: the
host's required `resolveImageSource` turns a destination into the URL to display, and an image it
does not resolve shows as its alt text. A new resolver applies to images displayed after it, without
rebuilding the editor. A file the editor refuses shows its images through the same resolver in its
read-only preview. The file preview resolves with `resolveMarkdownImageSource`, shared with every
Markdown surface: a file path in a conversation or a pod, such as
`![Revenue](pod-<id>/charts/revenue.png)`, the path agents read from `files.list`, or a file id,
`![Chart](fil_<id>)`, to the file API, which checks the reader's access; it resolves nothing else,
so an external URL never loads: like any image it does not resolve, it shows as its alt text, or
its destination without one, in the editor and in the read-only previews. Users insert one with
the Image entry of the `/` menu; agents and raw edits write them.

## Inserting embeds

With the host's `embeddableFiles`, the `/` menu adds an Image entry. Picking it asks the host to
load the files and turns the menu into a search over them, by name or path; picking a file
replaces the `/` with an image of its path whose alt text is the file name. Escape leaves the
search. The file preview offers the images of the document's own pod or conversation
(`useDocumentEmbeddableFiles`), and lists that pod's or conversation's files only once Image is
picked.

## Layout

| File | Owns |
| --- | --- |
| `DocumentEditor.tsx` | The component: layout, shortcuts, read-only and unsupported states. |
| `index.ts` | The public surface: `Document` and its types. |
| `useDocumentEditor.ts` | The TipTap editor, read-only or bound to the live session. |
| `dfm_persistence.ts` | `loadDfm` and `saveDfm`, between DFM source and the editor's document. |
| `content.ts` | Markdown parse and serialize for the body, with the round-trip checks. |
| `extensions.ts` | The schema: StarterKit, Markdown, placeholders and heading anchors. |
| `DocumentImage.ts` | The `image` node, its Markdown and its display through the host's resolver. |
| `DocumentTable.ts` | The `table` node, its rows and cells, and its GFM Markdown. |
| `blocks.ts`, `DocumentBlockMenu.tsx` | The `/` block menu, and its file search for embeds. |
| `DocumentSelectionToolbar.tsx` | The Comment action and formatting controls on a text selection. |
| `DocumentSaveStatus.tsx` | The status row, the live status and the agent at work. |
| `DocumentMarkdownPreview.tsx` | A file that cannot open, rendered read-only under the reason. |
| `DocumentAnchors.ts` | In-document heading links. |
| `DocumentComments.ts` | The `comment` mark, the thread commands and the highlights. |
| `DocumentCommentAnchor.ts` | Anchor directives in Markdown, and anchors to marks and back. |
| `useDocumentComments.ts` | Comment state and actions for the components below. |
| `DocumentCommentThread.tsx`, `DocumentCommentInput.tsx` | A thread and the new comment card, and the message field. |
| `DocumentCommentCard.tsx`, `DocumentCommentsList.tsx`, `DocumentCommentMarkers.tsx` | The card floating under commented text, the comments list and its button, and the gutter markers. |
| `commentInputExtensions.ts` | The message field's schema, its Markdown and its keys. |

Tests: `dfm_persistence.test.ts` for the load and save boundary, `useDocumentEditor.test.ts` for
the editor's modes, `useDocumentComments.test.ts` for comments through the editor. The editor's interaction tests lived in Sparkle stories and are not
ported yet.
