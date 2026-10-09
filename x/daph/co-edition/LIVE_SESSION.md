# Co-edition: live session design

Work in progress, reviewed once and expected to change.

Goal of the first version: one human and one agent co-edit a `.md` file live, the human watching
the agent's cursor move and its text appear. Yjs is the sync layer (README decision 3).

## Why a separate service

front-api runs on many pods and deploys several times a day. A
shared document held in a front pod would be cut at every deploy, and two people on the same
file could land on different pods holding diverging copies. Agent tools run in the
`front-agent-loop-*` Temporal workers, another process again.

## Transport: WebSocket, measured

Decided 2026-10-06: a WebSocket to a dedicated service, because several humans editing the
same document together is part of the plan.

The alternative considered was a relay over existing infrastructure: updates down an SSE stream
from `front-sse`, up as batched HTTP `POST`s to front-api, Redis in between, a durable log in
Postgres. No new service and nothing held in a pod's memory. It fails on the upward path.
Browser timings (Datadog RUM, 24 hours, 2026-10-06) for a trivial authenticated route, whose
server time is 24 ms at the median:

| Users and region                         | p50    | p95      |
| ---------------------------------------- | ------ | -------- |
| France, EU workspaces (`eu.dust.tt`)     | 163 ms | 1,206 ms |
| Germany, EU workspaces                   | 173 ms | 1,070 ms |
| United States, US workspaces (`dust.tt`) | 199 ms | 912 ms   |
| France, US workspaces                    | 329 ms | 1,113 ms |

Each HTTP request carries about 140 ms of overhead in region (Cloudflare, load balancer,
network, browser) and about a second at p95, before front-api's own tail (p95 around 400 ms on
trivial routes, from front's request logs). Keystrokes posted that way would reach other humans
late and in bursts. A WebSocket pays the connection cost once; each message then takes tens of
milliseconds. The agent-to-human direction alone would have been fine over SSE: it is the path
token streaming uses today.

Everything except the transport carries over if this is ever revisited: the server-side
document model, the stored state, the checkpoint, the agent tools, the comment model.

## Shape

- **A Hocuspocus service, deployed like `front-sse`.** `front-sse` runs the front-api server on
  its own pods, reached through a path prefix. The collab service goes one step further: a new
  entrypoint in the front-api workspace, built into the same image, deployed as its own
  `front-collab` deployment with its own tag, chart (the `viz` chart is the closest template) and
  fixed replica count, outside front's release. One replica per region for the MVP, so each
  document has exactly one owner; several replicas later, with the Redis extension and a
  per-document lease. See "The service".
- **Browsers** bind the editor with TipTap's Collaboration extension and connect over a
  WebSocket to a dedicated hostname per region. Presence and cursors use Yjs awareness.
- **Agents** reach the service through an internal endpoint (cluster DNS plus a shared JWT
  secret, like `viz` and the sandbox), which applies their changes as a server-side client
  (`openDirectConnection`), so they stream to open editors like any other client.
- **The `.md` file stays the source of truth.** The service writes it through the DFM codec on
  checkpoints and when the last client leaves, conditional on the version it loaded, and skips
  the write when nothing changed so normalization alone never rewrites a file.

## The service

**What it is.** One long-running Node process, `front-api/collab_server.ts`, built by
front-api's esbuild as a second target next to `server.ts`, so it imports front's code through
`@app/*` like front-api does: the DFM codec, the server-safe document model, workspace auth and
file system permissions. It is not a separate codebase and not a Hocuspocus program: Hocuspocus
is a library, embedded in our server.

**How it is deployed.**

```
 Browser (editor bound to Yjs)            Temporal worker (agent tool)
        |  WebSocket                              |  internal HTTP
        |  dedicated hostname per region          |  cluster DNS, shared secret
        v                                         v
 edge: Cloudflare, load balancer           (no public route)
        |                                         |
        v                                         v
 +--------------------------------------------------------------+
 |  front-collab pod  (front-api image, collab_server.js)       |
 +--------------------------------------------------------------+
        |                      |                       |
        v                      v                       v
   Postgres or GCS (open)  file system (GCS)       Redis
   stored Yjs state,       the .md files           per-file lock, lease;
   epoch, checkpoint                               later, relay between
   record                                          replicas
```

**What is inside the process.**

```
 node dist/collab_server.js
 +-------------------------------------------------------------------+
 |  One Node HTTP server, one port                                   |
 |                                                                   |
 |  Hono app (plain HTTP)               WebSocket upgrade            |
 |   GET  /healthz                              |                    |
 |   POST /internal/documents/edit              v                    |
 |   POST /internal/documents/comments  Hocuspocus instance (library)|
 |   (shared-secret auth)                - Yjs sync protocol         |
 |          |                            - awareness (cursors)       |
 |          |                            - one Y.Doc per open file   |
 |          |                            - calls our hooks:          |
 |          |                                onAuthenticate          |
 |          |                                onLoadDocument          |
 |          |                                onStoreDocument         |
 |          |                                onDisconnect            |
 |          v                                       |                |
 |   openDirectConnection(document)  <--------------+                |
 |   (a server-side client into the same Y.Doc)                      |
 +-------------------------------------------------------------------+
          |  our code, imported from front through @app/*
          v
   front/lib/api/co_edition/   tickets, store, load, checkpoint,
                               agent edit, comment commands
   front/lib/editor/           the server-safe document model
   front/lib/markdown/dfm/     the codec
```

Hono is the HTTP framework front-api already uses; it serves the plain routes. When a request
asks to upgrade to a WebSocket, the connection is handed to the Hocuspocus instance, which from
then on speaks the Yjs protocol on it and calls our hooks at the right moments.

| Hocuspocus provides | We write |
|---|---|
| WebSocket handling and the Yjs sync handshake | `onAuthenticate`: check the ticket and the file grants, mark viewers read-only |
| Relaying updates between connected browsers | `onLoadDocument`: stored state, or the `.md` through the codec as a new epoch |
| Awareness: presence and cursors | `onStoreDocument`: the stored state, conditional on the fencing token |
| Debouncing saves, one `Y.Doc` per open file | The checkpoint to the `.md`, with the pending record and the revision guard |
| Server-side clients (`openDirectConnection`) | The agent edit and the comment commands, behind the internal routes |
| Messages outside the document (`broadcastStateless`) | Pushing comment threads to browsers |
| Later: the Redis extension for several replicas | The per-file lock and the ownership lease |

**One edit, end to end.** A browser asks front-api for a ticket, opens a WebSocket to the
service, and is authenticated by `onAuthenticate`. The first client loads the document through
`onLoadDocument`; later ones share the same `Y.Doc` in memory. Each keystroke is a small Yjs
update that Hocuspocus applies and relays to the other browsers. Every few seconds
`onStoreDocument` saves the state; from time to time, and when the last client leaves, the
checkpoint writes the `.md`. An agent's `edit_document`, running in a Temporal worker, calls
`POST /internal/documents/edit` when a session is open; the service applies the change through a
direct connection, so it reaches every open browser like a person typing.

## Durable state between checkpoints

**What the state is.** The durable part of the document record (see "Session lifecycle and crash
recovery"; ownership lives apart, in the session record):

| Field | What it holds |
|---|---|
| Yjs document | One binary blob: the document's content (the editor's text, structure and marks, plus the envelope: front matter and anchor order) and Yjs's bookkeeping for it, which records for every piece of text which client created it and at which step, and marks deleted text. Typically 1.5 to 3 times the size of the text; it grows with editing history, which Yjs's garbage collection trims. |
| Epoch | Changes only when the state had to be rebuilt from the `.md`. |
| Checkpoint record | The file generation last written, and the pending checkpoint while one is in progress. |
| Comment threads | While a session holds them, until the checkpoint writes them to the `.md`. |
| Recent agent edit keys | So a retried agent call is not applied twice, on either path. |

The bookkeeping is what the `.md` cannot hold. The file has the content but not the identities.
If the state is lost and rebuilt from the file, the rebuilt text gets new identities, and every
browser reconnecting with the old ones merges its copy into the new one: the document
duplicates.

**Where it is stored.** Saved debounced every few seconds, in a durable store. **Open:** Postgres
(a table keyed by a stable file identity) or a GCS object next to the file (no schema, residency
already per region).

Not Redis, and not because of speed: one small write every few seconds per active document is
trivial for either. Losing the state forces a rebuild from the last checkpoint with a new epoch,
and every edit since that checkpoint, from everyone, has to be recovered by hand (see "Session
lifecycle and crash recovery"). Our Redis isn't configured for durability, so an incident there
would do that to every open document at once. Checkpointing the `.md` every few seconds would make
losing Redis cheap, but rewriting the file constantly creates a new file generation each time,
so agents' conditional writes would conflict far more often, and every save may trigger
indexing. A Redis configured for durability would also work, but it is a dedicated instance to
request from infra, more than a table or an object.

**What Redis is for.** What can be lost safely: the per-file lock, the ownership lease, and later
relaying updates between replicas. The existing `front/lib/lock.ts` lease is five seconds and not
renewed; the session needs a renewed lease with a fencing token.

## Session lifecycle and crash recovery

**Two records, kept apart.**

- **The document record**, durable, per file: the Yjs state while a session has unsaved work,
  the comment threads while a session holds them, the epoch, the last checkpointed file
  generation, an optional pending checkpoint (expected generation and content hash), and the
  idempotency keys of recent agent edits. It outlives sessions.
- **The session record**, transient: which instance owns the document, its lease and fencing
  token. Removed when the session closes.

**Opening.** Every writer of a co-editable `.md` (the file PUT route, the files `edit` and
`create` tools, `add_comment`; the other mutations later, see "Build plan") takes a short per-file
lock around its read-then-write. Opening a session takes the same lock, so a write already in
flight finishes first. Under the lock the service acquires the ownership lease (a renewed lease
with a fencing token), records the session, and loads: the stored Yjs state if the document record
still holds one (the previous session ended without a clean close), otherwise the `.md` as a new
epoch. Edits made through the file path between two sessions are therefore adopted as they are,
not treated as conflicts. While the session lives, the other writers find it under the lock and go
through the session or are refused. Sandbox writes in GCS mode bypass front and remain the
acknowledged exception (see "Write routing").

**Saved.** An edit is saved once the stored state includes it. Browsers keep their Yjs document,
in IndexedDB as well as in memory, until the server's stored state covers their updates. If the
service dies before storing, a reconnecting browser resends what is missing through the ordinary
Yjs handshake, with the same epoch and identities, so nothing duplicates. Edits are lost only if
the service and every browser that made them die within the same storing window. An agent edit
reports success only after it is stored.

**Checkpoint.** In order: record the pending checkpoint (the generation it expects, the hash of
the content it writes); write the `.md` conditional on that generation; record the new
generation and clear the pending checkpoint. The Yjs state being newer than the file is the
normal case. When a session loads stored Yjs state, the file is compared with the record:

- at the recorded generation: normal;
- at another generation whose content matches the pending hash: our own checkpoint finished
  before being recorded; adopt the new generation;
- anything else: an external write. The session keeps its state, refuses to overwrite, keeps
  both versions, and surfaces the conflict.

A new epoch starts when the Yjs state is missing: after a clean close, or if the stored state is
lost. A browser holding an older epoch then drops its document and reloads; anything it had not
saved is shown to the user to copy, not replayed, since a text diff cannot carry formatting and
anchors safely.

**Ownership during deploys.** The deployment uses the Recreate strategy (the old pod stops
before the new one starts; browsers reconnect after a few seconds), so two owners overlap only in
failure cases, which the following still covers:

- Writes to the document record are conditional on the current fencing token.
- A token check before a `.md` write is not enough: an owner can pause after the check, lose its
  lease, and resume, and a write conditional only on the file generation would still succeed.
  So taking ownership also updates the file's metadata, which changes its metageneration, and
  every checkpoint is conditional on both the generation and the metageneration it recorded. A
  previous owner's late write then fails. To verify in the spike: the file system layer exposes
  the generation precondition today, not the metageneration one.

**Agent edits.** Stored before published: the service computes the agent's change as one Yjs
update against the current state, writes the updated state and the idempotency key to the
document record in one write, then applies the update to the live document, which sends it to
browsers. If the service dies in between, the next load already has both the edit and its key,
so the retried call is a no-op. Published first, a browser could keep the edit through a crash
while the key was lost, and the retry would apply a second, independently generated edit. The
file path checks and records keys in the same document record, so a retry that crosses a
session opening or closing is still recognized.

**Playing an agent's edit back.** Built 2026-10-08, without awareness: the service sends a stateless
`agent_activity` message (agent, `reading` or `editing`) to the document's editors. `reading` goes
out once the agent's read passes the access check; `editing` goes out just before the agent's change
is applied, since Hocuspocus may batch document updates but sends stateless messages at once. Each
browser diffs its own document before and after the next remote change, so no range travels and
nothing persists in awareness. It then plays the change back as decorations: removed text fading,
new text revealed behind the agent's caret, a highlight settling. The document holds the whole change
from the start, so the typing effect is presentation only. The status "agent is working" lasts a
fixed 20 s after a read, since the service learns nothing between the read and the write; follow-ups
listen to the agent message's own stream to end it precisely, then stream the tool's arguments to
know the edited document while the model writes.

**Closing.** When the last client has been gone for a grace period (minutes, so a dropped
connection or a reload reconnects to the same state), under the per-file lock: final checkpoint of
the text and the threads to the `.md`; once it succeeds, the Yjs state and the threads are dropped
from the document record (its generation, epoch and keys stay), then the session record is removed
and the lease released. A close that fails to checkpoint keeps the Yjs state, so the next opening
recovers it. A browser that reconnects after the grace period with edits it never sent sees them
offered to copy, as for any epoch change.

**Acceptance cases** for the proof of concept: kill the service while two browsers type and
reconnect, nothing lost or duplicated; kill it between the checkpoint write and its record, the
next load adopts the file; an agent write racing a session opening, one of them waits; kill it
after an agent edit is stored but before it is published and retry the call, exactly one edit
and the human's edits kept; close a session, edit the file through the file path, reopen, the
edit is there and no conflict is raised; a previous owner's late checkpoint after ownership moved
is refused.

## Infra constraints

(from infra):

- Our edge (Cloudflare, the Google load balancer and its security policy) does not accept
  WebSocket upgrades on today's backends. The new service needs its own backend and security
  policy, set up with the infra owners.
- Long-lived connections are cut by the edge after an idle period and after an hour at most,
  so clients ping and reconnect cleanly by design.
- The ingress and routing setup needs changes, to plan with the infra owners.
- One deployment per region, each with its own durable store.
- Datadog logs and monitors are opt-in for a new service.

## Access and authorship

- A browser WebSocket cannot send an Authorization header: front-api mints a short-lived
  ticket scoped to workspace and file (precedent: the voice transcription token), and the
  service checks it and the file system grants on connect, then periodically.
- Viewers connect read-only. Comment threads are not in the shared document at all: the service
  owns them and changes them only through commands that stamp the author, and pushes changes to
  browsers as separate messages. A command is acknowledged once stored in the document record, and
  a browser receives the full list of threads when it connects or reconnects, so a missed push is
  never lost. How threads follow anchors that move or disappear is part of M4. Browsers cannot
  write a thread, so no Yjs update needs inspecting for one. Comment anchors stay marks in the
  text, which any editor can move or delete like text.

## Agent edits

Agent tools live in tdraier's `documents` MCP server (#34215, which adds `add_comment`), not in a
second server. `add_comment` writes the `.md` directly with the revision guard, which is right
without a live session; once a session holds the document, it goes through the session's comment
commands instead (see "Comments in the live document").

- `read_document` returns the canonical Markdown the service serializes, with anchors and a
  revision; `edit_document` matches `old_string` only against that output, with
  `expected_replacements` like the files `edit` tool, stays within one block or a run of whole
  blocks, keeps the anchors it touches, and is refused otherwise. Operations are computed
  atomically against one snapshot (start from `external_changes.ts` on the branch of the
  closed #34043) and applied as one
  transaction; browsers animate the inserted range; each call carries an idempotency key
  stored with the state, so a retried activity does not apply twice.

**One tool, two paths, chosen by the server.** Decided 2026-10-06. The agent always calls
`edit_document` and never needs to know whether a human has the document open. Under the
per-file lock, the tool checks for a live session:

- **Session open:** the edit goes through the service as one Yjs transaction, streamed to
  everyone watching with the agent's cursor.
- **No session:** a conditional write of the `.md` with the revision guard, retrying on conflict
  from a fresh read, the same loop `add_comment` uses.

Why not always through the service, opening the document headless when nobody has it open:

- Every Markdown edit by every agent would depend on the collaboration service being up, where
  today it only needs storage.
- With nobody watching there is no cursor to show and no one to sync with; loading,
  converting and checkpointing is strictly more work than a conditional write.

Why not let the agent choose between the files `edit` tool and `edit_document`: it cannot know
reliably whether a human has the document open, and a wrong guess either fails or writes under
a live session.

The files `edit` tool keeps working on a `.md` nobody has open, as today; on a `.md` with an
open session it is refused with a pointer to `edit_document` (see "Write routing"). A file the
editor cannot load never gets a live session, since humans can only view it read-only, so agents
always take the file path for it.

## Server-side document model

`loadDfm` and `saveDfm` already run in Node: the editor's persistence tests pass without a DOM,
and #34280 pins that with a contract and runs those tests in Node. But server code cannot import
them where they are. The `noClientImportsInServer` lint rule forbids `front/lib/api`, front-api
and the Temporal workers from importing `front/components/` or Sparkle, and the editor's model
lives in `front/components/editor/document/` with Sparkle class names in its extension list.

The repo already solves this for agent instructions: `front/lib/editor/` holds server variants of
editor extension lists, built from schema-only pieces. The document model follows that pattern:
the schema extensions without presentation, the Markdown conversion (`content.ts`),
`dfm_persistence.ts` and the comment and anchor helpers move to a server-safe module under
`front/lib/editor/`, and the editor imports them from there. tdraier has four open PRs on those
files (#34254, #34218, #34180, #34153), so the move is coordinated with tdraier: either tdraier
does it, or it lands right after that stack.

Comment-only operations do not need the editor model: `add_comment` (#34215) works on the DFM
codec alone, which is already server-safe. Only converting a body to and from the editor's
document does.

The codec runs in a worker thread with a timeout on the server (README decision 5, input bounds
from #34042, merged).

## Write routing

While a session is open, every mutation of the file goes through the service or is refused: files
`edit`, `create`, `move`, `copy`, `delete`, `upload_from_url`, the PUT route, and archive
extraction. A refused files `edit` on a `.md` points the agent to `edit_document`, which applies
the change through the session. Sandbox writes in GCS mode bypass front: the checkpoint's revision
check detects a write before it, but a stale sandbox write after a checkpoint can still overwrite
it. **Open:** enforce at the mount level, or keep recoverable versions and surface the conflict.
The MVP is limited to GCS-backed files, since conditional writes are refused for database-backed
storage.

## Editor wiring

StarterKit's history off and y-prosemirror's undo on, so each person undoes only their own
changes; the agent-write refresh from #34040 off for a session-bound editor.

## Build plan

The proof of concept is built where production will live, as small PRs behind a new
`co_edition_live` flag, so nothing is thrown away except a dev auth token and a script standing
in for the agent tool. The service is a new server entrypoint in the front-api workspace, built
into the same image, deployed later like `front-sse` as its own `front-collab` deployment with
its own tag. It imports front's code through `@app/*` like front-api does.

To a first local demo, two browsers editing live:

1. **The document model runs without a DOM** (#34280). A contract next to the editor and its
   persistence tests running in Node.
2. **Move the document model to `front/lib/editor/`.** See "Server-side document model". Waits
   on coordination with tdraier.
3. **Convert between DFM and a Yjs document.** `yjs` and `@tiptap/y-tiptap` (the binding TipTap
   3 uses); `dfmToYDoc` and `yDocToDfm` in `front/lib/api/co_edition/`: the body in a `body`
   fragment, front matter and anchor order in an `envelope` map; threads are not in the Yjs
   document (see "Access and authorship") and are passed alongside it. Contract: a round trip
   writes what the editor's own save writes. Written and tested with threads in the envelope;
   to adjust, then waiting on 2.
4. **Collab server skeleton.** `front-api/collab_server.ts` (Hono plus Hocuspocus), a new esbuild
   target next to `server.ts`, documents loaded from the `.md` and kept in memory, dev-only token
   auth.
5. **Run it in `dust-hive`.** A process, a port and a proxy route passing WebSocket upgrades.
6. **Bind the editor.** A `collaboration` mode on `Document`: provider, Collaboration and caret
   extensions on the `body` fragment, y-prosemirror undo, the Yjs document kept in IndexedDB
   until the server has stored it, no autosave; mounted when `co_edition_live` is on.

To a durable, agent-capable proof of concept:

7. **Real auth.** A front-api route mints a short-lived ticket scoped to workspace, file and
   role; the server checks it and the file system grants on connect.
8. **Document record, session record, lease and per-file lock.** A workspace-aware model and
   Resource keyed on a stable file identity (a path changes on rename), with a size cap and Yjs
   garbage collection; the ownership lease with fencing; the per-file lock taken by the existing
   writers. Contracts and the acceptance cases of "Session lifecycle and crash recovery".
9. **Checkpoint to the `.md`.** Through the codec, with the pending record and the revision
   guard, skipped when unchanged, with the recovery rules above.
10. **Agent edit.** `edit_document` in the `documents` MCP server, with both paths: through the
    session when one is open (one transaction, the agent's cursor, an idempotency key stored with
    the state), otherwise a conditional write of the `.md` like `add_comment`.
11. **Comment threads served by the session.** Threads outside the shared document, changed
    through commands and pushed to browsers; agreed with tdraier as part of M4.

Parallel, not blocking: the infra ask (a WebSocket backend per region with its own security
policy, hostname, ingress, chart modeled on `viz` and `front-sse`) and an hour on Cloudflare
Durable Objects as a fallback host.

After the proof of concept: the rest of write routing (step 8 already puts the file PUT route,
the files `edit` and `create` tools and `add_comment` under the per-file lock; `move`, `copy`,
`delete`, `upload_from_url` and archive extraction follow), deployment per region, then comments
in the live document with tdraier.

## Cut from the MVP

Several humans editing at once (the demos use one human, in one or two browser tabs), several
replicas, the agent's comment tools going through the session (`add_comment` keeps writing the
file), merging sandbox writes (detect and surface only).

**Done when:** a human watches the agent's cursor move and its text appear; killing the service
while typing and reconnecting shows the same document, once; the file on disk matches what the
editor showed after the last checkpoint.

## Comments in the live document

To agree between tdraier (comments) and daph (live session) before more code lands, so the
comments work does not need rework when the editor binds to Yjs:

- Threads live today in the editor document's root attributes (`doc.attrs.comments`, see
  `DocumentComments.ts`). In the live session, anchors stay marks in the text and threads stay
  out of the shared document: the service owns them, changes them through commands and pushes
  them to browsers. The envelope (front matter, anchor order) moves into the shared document, or
  the checkpoint writes stale values.
- Comment mutations are server commands only (add, reply, resolve), used by both the UI and
  the agent tools, with the author stamped server-side. tdraier owns the comment operations and
  their UI; daph owns the session, the edit operation and the infrastructure.
- To decide together: what happens to a thread whose anchored text is deleted, and whether
  overlapping comment marks survive y-prosemirror.

```
      /\_/\
     ( o.o )
    =( =^= )=
     (\   /)
    (__)_(__)~
```

Thank you for reading.
