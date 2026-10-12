# Co-edition: work log

Work in progress, not exhaustive, and expected to change. The milestones are the current
order of attack, not a commitment.

Living status for anyone, human or agent, picking up this initiative. Read `README.md` first.
Update this file in the same PR as the work it describes. Dates are absolute.

## Done

- 2026-09-30 `co_edition` feature flag, dust_only (#33638).
- 2026-09-30 Draft #33676 marks `frame_documents` as superseded.
- 2026-10-02 DFM codec merged (#33773): `front/lib/markdown/dfm/`, 154 tests, reviewed in
  six rounds plus fuzzing and a security review. Approved by tdraier on an earlier commit; the
  parser rewrite and the module reorganization came after that approval.
- 2026-10-02 Editor branch `dfm-editor` (daph, local, three commits rebased on main): Sparkle
  `Document` core copied into `front/components/editor/document/`, DFM-only persistence,
  mounted in the conversation side panel and file dialog behind `co_edition`. Verified live in a
  hive: edit, autosave, reload.
- 2026-10-05 and 06, editor M1 merged behind `co_edition`: DFM persistence (#34038), host mount
  in the conversation panel and file dialog (#34029), WIP badge (#34125), refresh of open files
  when an agent's file tool writes them (#34040), no Markdown editor on a mount that refuses
  writes (#34149), no plain editor on preview text cut at 100k characters (#34205, for
  everyone), `writeFileContentByPath` returns a `Result` (#34216).
- 2026-10-06 closed, branches kept, to be superseded by the live session: #34041 (saves
  conditional on the file revision, whole file for the rich editor) and #34043 (agent writes
  adopted in place with a typing animation). What carries over: the revision guard moves to
  the session's server-side checkpoint; `external_changes.ts` (block diff and frame pacing) is
  the starting point for turning an agent's file write into operations on the shared document.

## In progress

- M3 live session with Yjs (daph), starting 2026-10-06 with the spike below.
- 2026-10-08 agent edits played back in live documents (daph): "agent is working / editing" status
  and a typing playback of the change, from stateless messages of the collab server (see
  `LIVE_SESSION.md`, "Playing an agent's edit back"). Follow-ups: end "working" on the agent
  message's end event (its stream, by `agentMessageId`); stream tool arguments to name the edited
  document early (LLM layer, with flav).
- 2026-10-05 M4 editor comments (tdraier), two PRs stacked on #34029: #34126 shows comments
  (`editor-dfm-comments`), the next one writes them (`editor-dfm-comment-authoring`).
  Sparkle's comment UI ported to `front/components/editor/document/`, on DFM threads. Anchors
  load as comment marks through a Markdown tokenizer that reads directives with the codec's new
  `readAnchorDirective`, and save back as one pair per comment; a file with an anchor the editor
  cannot highlight stays read-only. Not in it: authorship enforcement (comments are signed
  client-side), agent tools, the document conversation, Markdown rendering of message bodies.

## Plan, as milestones

Each milestone names the Notion stream it serves and the outcome that proves it. Milestones
ship behind `co_edition` until M7. The order is the dependency order, not a sprint plan.

### M0. Foundations (stream 1: the document). Done, one follow-up

- Codec merged. Follow-up from the security review in #34042, before any server-side caller:
  input bounds (length, leading container run per line, inline delimiter count, list item
  count) checked before every parser call, non-overlapping occurrence search in
  `anchorComment`, and a README sentence saying the codec does not authenticate authors.
  Server callers still own their latency and should isolate the codec once untrusted input
  reaches it. Measured on the way: micromark is quadratic in the number of items of a list
  (50k flat items: 12 s) and in `]` characters (256k: 4 min), not only in nesting and emphasis.
- Outcome: an adversarial file fails fast with a clear error instead of tying up a process.

### M1. A human edits a `.md` in the rich editor (stream 2, single human)

- Editor PRs #34027, #34038, #34029 as drafts, then hardened: load the raw file bytes, not the truncated
  and trimmed preview text; save through the revision-aware PUT the Frames client uses and
  keep the draft on 412; a Source toggle that also shows front matter; Pod file tab parity
  (`PodFileTabPreview.tsx` is a third Markdown editor copy); Storybook tests ported to vitest.
- `.txt` keeps the plain editor. `.md` detection relies on the `text/markdown` content type;
  check what files created by agents and by upload actually carry.
- The editor supports the Markdown agents write: tables, task lists and tilde fences are
  refused today, so those files open read-only.
- Outcome: open, edit, reload, close and reopen a `.md` from the conversation panel, the
  dialog and the Pod tab; the bytes on disk are what the editor showed, byte for byte outside
  the body.

### M2. A human and an agent edit the same file, agent-only mode (streams 1 and 2)

This is the first real test of the format and the gate the codec PR named: an agent has edited
a DFM file from a sandbox and the editor still opens it.

- Agent side: agents read and write the file with ordinary tools (`files.edit`, sandbox
  `edit_file`). Give them what they need to do it right: a short DFM reading note in the skill
  or instructions that touch files, pointing at the codec README and its fixture; confirm an
  agent edits a body with anchors without breaking them; decide what the codec's refusal
  messages look like from inside a tool.
- Guard the agent write paths: `files.edit` and `files.create` adopt the revision check the
  PUT route has; sandbox writes in GCS mode cannot be guarded and that fact is recorded.
- The human side learns about agent writes. Minimum done (stacked on #34029): when a `files` or
  `sandbox` tool action finishes, the conversation revalidates open file contents, so a clean
  editor reopens on the agent's version and a dirty one holds its draft. Two cases it does not
  cover, which the `doc_updated` conversation event modeled on `plan_updated` would: a file
  tool the agent calls from inside a sandbox `bash` session (child actions emit no event, so the
  refresh waits for the enclosing `bash` to finish), and a preview opened by file id rather than
  by path (different cache key).
- The agent learns about the human side: today nothing tells an agent which file is open in
  the side panel. Pass the open document path in the message context so "refine this" has a
  target.
- Indexing: the project sync runs after delete and extract but not after a PUT. A saved `.md`
  must reach search, body and comments.
- Revision-guarded saves in the editor and in-place adoption were built (#34041, #34043) and
  closed in favor of the live session; see Done.
- Outcome: in one conversation, the human edits in the editor, asks the agent for a change,
  the agent edits the file, the editor shows the result; then both edit at once and the loser
  is told, never overwritten. Nothing lost in ten rounds of this.

### M3. Live session (stream 2, human-present mode)

Design: `LIVE_SESSION.md`. A Hocuspocus service per region, run like `front-sse`, with the
merged Yjs state stored durably between checkpoints of the `.md` file.

- Build plan in `LIVE_SESSION.md`: eleven small PRs behind a new `co_edition_live` flag. First
  one open: #34280 (the document model runs without a DOM). Next: moving the document model to
  `front/lib/editor/`, to coordinate with tdraier's open comment PRs. In parallel: the infra ask,
  and an hour on Cloudflare Durable Objects as a fallback host.
- Outcome: a human watches the agent's cursor move and its text appear; killing the service
  while typing and reconnecting shows the same document, once; the file on disk matches what
  the editor showed after the last checkpoint.

### M4. Comments (stream 3)

To agree between tdraier and daph before more comment code lands: the comment model inside the
live document (`LIVE_SESSION.md`, "Comments in the live document").

- Editor: anchors become marks on load, marks become anchors on save; comment panel; add,
  reply, resolve; the fixture renders as expected.
- Agents: comment through a tool built on `anchorComment` and the codec, reply and resolve
  through tools, never by hand-editing the block. Mentions in a comment reuse the existing
  mention syntax.
- Document conversation: link table plus metadata key, created lazily on the first mention or
  on demand; a mention in a comment posts into it with the quoted span as context; the agent's
  reply lands in the thread through the tool.
- Authorship enforcement decided and implemented server-side (`sig` attribute or DB record;
  see README open questions). An agent cannot sign as a human; a sandbox-written file cannot
  smuggle human-signed messages.
- Outcome: a human comments "@dust refine this" on a paragraph; the agent answers in the
  thread and, if asked, edits the paragraph; both are attributed correctly; search finds the
  comment.

### M5. Create a document from the UI, no agent, no tokens (stream 1)

- Deliberately after the live session and comments: no new entry point into documents while
  the co-edition experience itself is not there yet. New document from the conversation files
  panel and from a Pod: name, empty DFM body or a
  template body, correct content type, opens in the editor.
- Outcome: a user with no agent in the loop creates and edits a doc in a Pod.

### M6. Suggestions (stream 4)

- Directive and codec support (the codec README's "adding a directive" steps), editor
  rendering, accept or reject one by one or all, agent tools. Agents edit directly when asked
  for a change and suggest when asked for a review.
- Outcome: an agent reviews a doc and leaves suggestions the human accepts one by one.

### M7. Roles and rollout

- Viewer, commenter, editor derived from the file system grants; public links view-only; no
  anonymous comments or edits.
- Frame documents retirement: skill files (#33087, #33132), flag, viz wrapper, Sparkle
  `Document`. Tell flav before. Can land any time after M1 replaces the editor.
- Rollout per the product doc: Dust internal until live editing and comments work (M3 and
  M4), then GA with ship-day comms and in-product banner.

### Later (stream 5, extras)

History and restore from file versions, themes and templates via front matter, embedding a
Frame, stable links between docs, images stored next to the doc, PDF and Markdown export with
directives stripped, notifications on replies and mentions.

## Decisions pending someone

- A new WebSocket service per region: Cloud Armor policy, hostname, ingress (daph with the
  infra owners, M3).
- Where the merged Yjs state is stored: Postgres or a GCS object (daph, M3 spike).
- The comment model inside the live document (tdraier and daph, before M4 continues).
- Authorship enforcement mechanism (daph, to settle with the team).
- Whether to ungate the editor before comments or ship both together (daph; current call: keep
  behind the flag).

## Things that bit us

- Since #34057 the repo formats with oxfmt and lints with oxlint; there is no `biome.json`.
  Running Biome with `--write` falls back to its defaults and rewrites whole files with tabs.
  After rebasing onto that change, run `npm install` so the pinned binaries exist.
- After rebasing on a main that moved a lot, rebuild `sdks/js` and `sparkle` locally or the
  type check fails on unrelated files.
- The hoisted `mdast-util-directive@2` ships its own nested `mdast-util-from-markdown@1`;
  importing it from front against our `@2` crashes. The editor must use `mdast-util-directive@3`
  if it wires directives through the parser.
- An input bound is only as good as its match with what the parser receives. Three review
  rounds on #34042 found text transformed between the check and the parse: a leading byte
  order mark, a bare `\r` read as a line ending, anchors stripped from a body, a built body
  parsed without a check, a body sliced after front matter with a mark of its own. Check the exact string handed to the parser, and test it with a spy
  on the parser.
- Snyk runs real tests only when a manifest changes and its report needs a Snyk login; the
  GitHub status carries no detail.
