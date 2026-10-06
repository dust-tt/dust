# Co-edition: technical notes

Work in progress. These notes are not exhaustive and will change as we build and learn; a
decision recorded here is the current call, not a commitment. When something below disagrees
with the code or with the Notion product doc, say so in `WORK.md` and fix it here.

Owner: daph. Product doc: Notion "Co-edition" (Product Initiatives). flav built the
Frame documents PoC that preceded this work.
This file holds the technical decisions and the facts about the codebase they rest on. The
living status and task list are in `WORK.md` next to it. Both are meant to be read by humans
and by agents starting a session on this initiative: read them first, update them last.

## Problem

Several humans and several agents write, review, comment on and edit the same textual
document in Dust, at the same time, without a round trip through Notion or Google Docs. The
document, the conversation and the agents working on it all live in Dust.

The one invariant everything below protects: nobody ever loses text or a comment.

## Constraints from the product doc

1. A `.md` file is the document. Agents keep reading and editing it with ordinary file and
   sandbox tools. `.txt` stays a raw text file. Frames are excluded.
2. Comments and suggestions live inside the file, so search, the sandbox and the editor see
   the same thing. Each is signed `user:<id>` or `agent:<id>`, and an agent cannot sign as a
   human.
3. When a human opens the document, a live session takes over and direct file writes are
   refused with a message pointing agents to the co-edition tools.
4. Access comes from the file system. No new ACL. Viewer, commenter, editor roles like Google
   Docs.
5. Rollout: Dust internal until live editing and comments work, then everyone.

## Related context

- Feature flag `co_edition` (dust_only, #33638). The editor and every later piece sit behind it
  until the conditions in `WORK.md` are met.
- Codec: `front/lib/markdown/dfm/` (#33773, merged 2026-10-02). Its `README.md` is the
  format reference; the `@cc` contracts on the public functions are the rules.
- Frame documents (`frame_documents`, #33087, #33132) are the predecessor. Draft #33676 marks
  the flag superseded. The Sparkle `Document` component and the `@dust/document/v1` viz
  wrapper are removed once no Frame imports them.
- Revision guard on file writes: #32977, `front/lib/api/files/revisions.ts`.
- Precedent for an agent-edited Markdown file with lock and notification: plan mode,
  `front/lib/api/assistant/plan_mode.ts`.
- Precedent for a conversation tied to another object: project tasks,
  `front/lib/project_task/start_agent.ts`.

## Decisions

### 1. The file is the source of truth, in DFM

DFM (Dust-Flavored Markdown) is Markdown plus optional YAML front matter, paired
`:comment-start{id}` / `:comment-end{id}` anchors around commented text, and a trailing
`:::annotations` block holding the threads: `::comment{id status}` then one
`::message{author name at}` per message, each followed by its Markdown body. Details and a
full example in the codec README.

Why markers in the body rather than quotes stored in the thread: the editor's plain text and
the Markdown source are two different strings, so quote matching would need two text models.
Markers ride the parser into the editor as marks and follow the text through edits. They also
let an agent reading the raw file see the comment in context.

Why a strict codec: parsing either succeeds completely or fails with a located error, and
serializing refuses anything that would not read back identically, proven by reparsing its own
output. Those two rules are the whole robustness story. Everything else in the codec asks a
real Markdown parser (`mdast-util-from-markdown`) rather than guessing: where code is,
whether a fence is open, whether an insertion changed the block structure. No hand-written
Markdown rules remain.

### 2. Comment threads are a record in the file; agent replies execute in a conversation

A thread is flat messages with typed authors. That record stays in the file: it is what search
indexes, what the sandbox reads, what survives a move.

An agent reply, for instance after "@dust can you refine this" in a comment, has to run
somewhere with the agent loop, tools, streaming and retries. In Dust that is a conversation.
Mentions, steering and the agent loop are all keyed to a conversation message; there is no
other trigger surface and no thread or sub-conversation concept. So:

- One conversation per document, created lazily on the first mention or on demand, linked to
  the document the way project tasks link theirs (metadata key plus link table, a content
  fragment with the document, then `postUserMessage`).
- A document opened from a conversation uses that conversation. A document opened from a pod
  spawns one. That gives both directions: edit a doc from a conversation, start a conversation
  from a doc.
- The agent writes its answer back into the thread through a tool, not by hand-editing the
  file, so the write is attributed and validated.
- Mentions reuse the existing `:mention[name]{sId=...}` syntax. The codec passes it through a
  message body unchanged; no grammar change.

### 3. Liveness and concurrency: a live session from the first human-present milestone

Two distinct needs, often conflated:

- **Liveness.** When a human has the document open and an agent edits it, the human sees the
  agent's cursor and watches the text appear, the way a colleague's edits appear in Google
  Docs. This holds with one human and one agent. It is the experience, not an optimization.
- **Reconciliation.** When two parties change the same text at the same time, someone decides
  the result. A revision check, a central authority that rebases operations, or a CRDT.

The plan:

1. **Agent-only mode and the safety net, now.** Optimistic concurrency on every file write.
   The file PUT route already supports `X-Dust-If-Revision-Match` and answers 412 on
   conflict, backed by the GCS object generation. Only the Frames client uses it. The editor
   saves through it and keeps the draft on conflict. This is what protects the file whenever
   no session is open, and the fallback if a session breaks.
2. **Human-present mode is a live session, from its first version.** Opening the document in
   the editor opens a session: shared document state on the server, presence (who is in the
   document, where their cursor is, agents included), and agent edits applied as operations
   streamed to every open editor rather than as a file rewrite. The agent edits through
   co-edition tools that emit operations, which is what makes its typing visible. Direct file
   writes are refused with a pointer to those tools while the session is open. The file is
   written on checkpoints and on close, through the codec, so reload or disconnect loses
   nothing. Plan mode (`plan.md`, Redis lock, `plan_updated` event) is the closest existing
   shape, minus the streaming.
3. **The sync layer is Yjs, with Hocuspocus embedded in our own server.** Chosen 2026-10-06,
   design in `LIVE_SESSION.md`. Yjs with `y-prosemirror` brings cursors, presence and any
   number of clients. The alternative, ProseMirror `collab` with a central authority, is simpler
   and has no CRDT, but cursors and multi-client would have to be built, and several humans
   editing together is part of the plan.

Several humans editing the same document at once is then a matter of opening more clients on
the same session, not a new architecture.

### 4. The editor is a copy of Sparkle `Document` inside front, DFM only

Copied into `front/components/editor/document/`, comments and visuals wiring removed, DFM as
its only persistence (no TipTap JSON). Front matter and threads ride along in an envelope
until the editor learns them. It mounts for `.md` files in the conversation side panel and the
file dialog when `co_edition` is on and the file parses. The Sparkle copy is frozen until the
Frame documents retirement PR.

### 5. No nesting-depth rule inside the codec, but hard input caps before the parser

The parser is superlinear on some shapes (see Facts). The codec must cap body size and
container nesting before calling the parser, and server callers must run it off the main
thread with a timeout. A depth rule inside the grammar was rejected: it would refuse valid
Markdown and reintroduce hand-written Markdown rules. `checkInputBounds` in `parser.ts` is the
one place allowed to approximate CommonMark (what a list marker or a quote prefix looks like),
because it only decides whether to parse, never what the text means.

## Open questions

- **Authorship enforcement.** In the default GCS storage mode, sandbox writes go through
  gcsfuse and never touch front, so there is no write path to validate a `user:` message. The
  file alone cannot prove who wrote it. Two ways out, both server-side: a `sig` attribute on
  messages signed by the server, or a DB record of human messages with the file as a
  materialized copy. Adding an attribute is a one-file grammar change. Must be decided before
  comments ship.
- **Where the document to conversation link lives.** Front matter keeps the file
  self-contained; a link table is more robust. Leaning link table, like project tasks.
- **Suggestions.** Next directive. Insert, delete, replace; accept or reject one by one or
  all. Same attribution and enforcement as comments. The codec's "adding a directive" steps are
  written for it.

## Facts about the codebase these decisions rest on

Checked on 2026-10-02 against main. Verify before relying on a path.

File storage

- Storage mode is per pod or conversation: `gcs` (default; bytes in the private bucket,
  sandboxes see them through gcsfuse) or `database` (Postgres tree, GCS blobs; enabled by a
  pod name starting with `[Dust FS] ` or `metadata.useDatabaseFileSystem`).
- `front-api/routes/w/[wId]/files/path/[...canonicalPath].ts`: GET returns
  `X-Dust-File-Revision` on GCS; PUT takes `x-dust-if-revision-match`, answers 412 on
  conflict, 413 above 512 KB. The DB backend has its own compare-and-swap on `blobId` and a
  `contentRevision`, not surfaced on this route.
- `writeFileContentByPath` and `useFileContentByUrl` (`front/lib/swr/files.ts`) send and
  keep no revision. `useFrameFiles` (`front/lib/swr/frame_files.ts`) does both and maps 412
  to a conflict. Reuse it.
- Agent tools `files.edit` and `files.create` do read-modify-write through `dustFs.write`
  with no revision. Sandbox `edit_file` and `write_file` write through the mount and bypass
  front in GCS mode.
- There is no file-change event. An agent edit does not refresh an open preview. Plan mode's
  `plan_updated` is the only "file changed, refetch" conversation event.
- The file preview truncates text at 100k characters and trims whitespace before handing it
  to the Markdown editor, so a save can write a truncated file. The rich editor must load the
  raw bytes.
- No lock, lease, presence or last-editor concept exists for files.

Conversations

- Messages are linear by rank with versions; `parentId` links versions or an agent reply to
  its user message. No branching inside a conversation.
- `run_agent` creates child conversations at `depth + 1` (max depth 4), linked only through
  `UserMessage.agenticOriginMessageId`. Forks (`ConversationForkModel`) start a new root
  conversation with a compaction summary. `visibility: "test"` hides a conversation (used by
  the agent builder sidekick).
- `createConversation` then `postUserMessage` is the server-side flow; project tasks use it
  with `metadata.projectTaskId` and a link table.
- Nothing tells an agent which file is open in the side panel. The side panel state is in the
  URL hash (`spid`, `spt`).
- No comment or annotation model exists in the database. Comments exist only inside files.

Codec performance (security review, 2026-10-02)

- `mdast-util-from-markdown` is superlinear on some container-heavy shapes, and the codec
  parses several times per operation. Until the follow-up caps input size and nesting before
  the parser, the codec must not be called from a request path. Details in the follow-up PR.
- Every regex is linear on large adversarial input. Prototype pollution is blocked by the
  attribute key pattern and `.strict()` schemas. The round-trip check compares the whole
  document.

## Co-editors

```
             _______________________
            |  # Pencil Case         |
  ^,,,^     |  A good pencil case    |     ^,,,^
( • · • )   |  holds exactly three|  |   ( • · • )
 =     =    |  things...          ^  |    =     =
 /     \    |_______________________|    /    づ♡
"I'll take the intro."                    "Then I'll fix the typos."
```
