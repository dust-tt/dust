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

## In progress

- Editor PR 1 (`dfm-editor`): push and open as draft.

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

- Editor PR 1 (`dfm-editor`) pushed as a draft, then hardened: load the raw file bytes, not
  the truncated and trimmed preview text; save through the revision-aware PUT the Frames
  client uses and keep the draft on 412; a Source toggle that also shows front matter; Pod
  file tab parity (`PodFileTabPreview.tsx` is a third Markdown editor copy); Storybook tests
  ported to vitest; a Flavify pass.
- `.txt` keeps the plain editor. `.md` detection relies on the `text/markdown` content type;
  check what files created by agents and by upload actually carry.
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
- The human side learns about agent writes: today nothing refreshes an open editor. Minimum:
  on an agent file action that touched the open path, refetch and, if the draft is clean,
  reload; if dirty, surface the conflict and keep the draft. A `doc_updated` conversation event
  modeled on `plan_updated` is the clean version.
- The agent learns about the human side: today nothing tells an agent which file is open in
  the side panel. Pass the open document path in the message context so "refine this" has a
  target.
- Indexing: the project sync runs after delete and extract but not after a PUT. A saved `.md`
  must reach search, body and comments.
- Outcome: in one conversation, the human edits in the editor, asks the agent for a change,
  the agent edits the file, the editor shows the result; then both edit at once and the loser
  is told, never overwritten. Nothing lost in ten rounds of this.

### M3. Create a document from the UI, no agent, no tokens (stream 1)

- New document from the conversation files panel and from a Pod: name, empty DFM body or a
  template body, correct content type, opens in the editor.
- Outcome: a user with no agent in the loop creates and edits a doc in a Pod.

### M4. Comments (stream 3)

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

### M5. Live session (stream 2, human-present mode)

- Sync-layer spike first (Yjs vs ProseMirror collab, README decision 3), answering: can an
  agent tool act as a client from the server, and how is the file checkpoint produced from
  the shared document through the codec, anchors included.
- Then: session opens when a human opens the document and closes when the last one leaves;
  shared document state on the server; presence with cursors, agents included; agent edits
  through co-edition tools emitting operations streamed to open editors; direct file writes
  refused with a pointer to those tools while the session is open; checkpoints and close write
  the file through the codec; reload or disconnect loses nothing; several humans at once.
- Outcome: a human watches the agent's cursor move and its text appear; two humans and one
  agent edit together; killing the tab and reopening shows the same document.

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
- Rollout per the product doc: Dust internal until live editing and comments work (M4 and
  M5), then GA with ship-day comms and in-product banner.

### Later (stream 5, extras)

History and restore from file versions, themes and templates via front matter, embedding a
Frame, stable links between docs, images stored next to the doc, PDF and Markdown export with
directives stripped, notifications on replies and mentions.

## Decisions pending someone

- Authorship enforcement mechanism (daph, to settle with the team).
- Whether to ungate the editor before comments or ship both together (daph; current call: keep
  behind the flag).

## Things that bit us

- `npm run format:changed` skips untracked files; run biome on the directory explicitly for
  new modules.
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
