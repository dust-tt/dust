# Co-edition: target architecture

Last week's proof of concept shipped fast, across many PRs, with names chosen on the way. This page
is the target we clean up towards: one word per concept, one place per job. Every cleanup PR moves
code towards it, never sideways, so nothing gets renamed twice.

Status: proposal.

## Three rules

1. **Business logic lives in `front`, transport in `front-api`** (`one-way-front-dependency`,
   `thin-api-handlers`). Access rules, Markdown and Yjs conversions, comment logic, loading and
   saving files: `front/lib/api/*`, so workers, scripts and tests can reuse them. What only makes
   sense inside the collab server process (Hocuspocus, its connections, the HTTP routes) lives in
   `front-api/lib/collab/`.
2. **`Document*` is about a document, in any mode. `Collab*` only exists live. Never both.**
   `DocumentEditor` is the editor of a document, `DocumentComments` its comments,
   `DocumentImage` an image in it, `DfmDocument` a document parsed, `lib/api/documents/` what
   agents do on documents. `CollabEditor`, `CollabSession`, `CollabParticipant` only exist in a
   live session, which already implies a document. No component is called just `Document`: it
   would clash with the DOM's `document` and Hocuspocus's `Document`.
3. **One word per concept**, the same in types, functions, files, contracts and docs. The feature is
   **co-edition** (product, flag `co_edition`, docs). The code is **collab**. "Live" stays in UI text
   only ("This file is being edited live").

## Vocabulary

| Concept | Word | Today (all replaced) |
|---|---|---|
| The `.md` file in storage | **file** | |
| Its full Markdown text | **source** | `content`, `text`, `dfm`, `markdown` |
| A parsed Dust Doc (`DfmDocument`) | **document** | also used for the Y.Doc and Hocuspocus's `Document` |
| What the collab server holds for an open file: Y.Doc, threads, last save | **session** (`CollabSession`) | `LiveDocument`, `LiveSession`, `openSession` |
| The session's name, `<workspaceId>:<path>` | **session name** | `toLiveDocumentName`, `documentName` |
| A browser's WebSocket to a session | **connection** | |
| A user's granted access to a file through the collab server: auth, path, can write | **access** (`CollabAccess`) | `LiveFile` |
| A refusal of that access | `CollabAccessError` | `LiveAccessError`, `LiveFileError` |
| The one-time credential a browser connects with | **ticket** (`CollabTicket`) | `LiveTicket` |
| Writing a session back to its file | **save** | `checkpoint`, `store` |
| A comment thread, and one entry in it | **comment**, **message** (as the DFM codec) | `threads` on the wire |
| A browser's request to change comments | **comment request** | `LiveCommentCommand` |
| An agent acting on a session | `CollabAgent` `{agentId, name}` | `LiveAgent`, `DfmAgent` (`sId`) |
| Reading or writing a session's source from front | `readCollabSource`, `writeCollabSource` | `fetch`/`push`/`read`/`writeLiveSource` |
| Writing a file through its session when one is open | `writeThroughCollabSession` | `writeThroughLiveSession` |

Hocuspocus's own names (`Document`, `documentName`, `onStoreDocument`) stay where we call its API.

## Layout

### The collab server: `front-api/lib/collab/`

One Node process, started by `front-api/collab_server.ts`, built from front-api's code. On one port
it serves browsers' WebSockets through Hocuspocus and front's internal HTTP calls.

```
front-api/lib/collab/
├── README.md                  this map
├── hocuspocus.ts              builds Hocuspocus; thin hooks that call session.ts;
│                              parses and answers browsers' messages; shutdown
├── session.ts                 per open file: state, lifecycle, saving, the mutation queue,
│                              reading and writing the source, applying comment requests
├── connection_access.ts       who may stay connected: at connect, then every 5 min
├── internal_routes.ts         the HTTP routes only front can call
└── collab_access_errors.ts    CollabAccessError → HTTP errors, for any route
```

Session operations return `Result`; the hooks turn errors into throws, the only place Hocuspocus
needs them (`hocuspocus-hook-protocol`). `session.ts` never imports `hocuspocus.ts`: operations
take the Hocuspocus instance as a parameter.

### Collab business logic: `front/lib/api/collab/`

```
front/lib/api/collab/
├── access.ts                  CollabAccess: check, read-only check, recheck
├── session_file.ts            load a session from its file, save it back
├── comments.ts                apply a comment request, dispatch mentions
├── tickets.ts                 mint and redeem tickets
├── ydoc.ts                    source ↔ Y.Doc
├── client.ts                  front's HTTP client to the collab server
└── write_through_session.ts   write a file through its session, with retries
```

### Dust Doc logic: `front/lib/api/documents/` (today `front/lib/api/files/dfm_*`)

```
front/lib/api/documents/
├── read_write.ts              read a document's source (session first, else the file);
│                              apply an agent's change
├── file_api_write.ts          the file API's PUT, through the session when one is open
├── agent_edits.ts             edit_document
├── agent_comments.ts          add_comment, reply_to_comment
├── comment_signatures.ts      sign and verify comment messages
└── comment_mentions.ts        post comment mentions to the document's conversation
```

### The editor model, shared by browser and server: `front/lib/editor/document/`

Today in `front/components/editor/document/`, which makes the collab server bundle UI code
(Sparkle, Lingui, ProseMirror's view).

```
front/lib/editor/document/
├── schema.ts                  TipTap schema, Markdown parse and serialize (today content.ts)
├── dfm_tiptap.ts              DFM ↔ TipTap JSON (today dfm_persistence.ts)
└── comment_marks.ts           comment marks ↔ threads, without DOM (today in DocumentComments.ts)
```

### The DFM codec: `front/lib/markdown/dfm/`

Unchanged.

### The browser

```
front/lib/client/collab/       the WebSocket protocol, no React
├── messages.ts                stateless message helpers, caret colors (today live_session.ts)
├── comments.ts                the comment channel (today live_comments.ts)
└── agents.ts                  agent activity and edit listeners (today live_agents.ts)

front/hooks/                   network hooks (front/CONTRACTS `network-operations-in-swr-hooks`)
├── useCollabConnection.ts     connects, syncs, reconnects (today useLiveSession.ts)
└── useCollabTicket.ts         gets a ticket (today useLiveTicket.ts)

front/components/editor/document/   UI only
├── DocumentEditor.tsx         picks the mode (today Document.tsx)
├── CollabEditor.tsx           the editor in a session (today LiveDocument.tsx)
├── useCollabAgentActivity.ts  (today useLiveAgentActivity.ts)
├── useCollabParticipants.ts   (today useLiveParticipants.ts)
└── ...                        comment UI, toolbar, blocks: unchanged
```

`DocumentComments.ts` (1272 lines) and `useDocumentComments.ts` (882) split along the lines in the
audit: mark, decorations, commands; local and collab command backends.

### Shared types

```
front/types/collab.ts          browser ↔ collab server: WebSocket messages, session name
front/types/collab_internal.ts front ↔ collab server: internal HTTP schemas
```

## Migration

Each PR under 500 lines, moving and renaming one family at once with its final names, stacked in
this order.

| # | PR | Status |
|---|---|---|
| 1 | `live_file.ts` → `access.ts` + `session_file.ts`, `CollabAccess`, `CollabSave` | #34986 |
| 2 | `comments.ts`, `tickets.ts`, `client.ts`, `write_through_session.ts` | #34987 |
| 3 | `types/collab_internal.ts`, `CollabSource*`, the `collab_session_*` error codes | #34988 |
| 4 | `lib/api/files/dfm_*` → `lib/api/documents/` | #34989 |
| 5 | Collab server access: `connection_access.ts`, `collab_access_errors.ts` (replaces #34968) | |
| 6 | `session.ts`, part 1: state, `getLoadedSession`, reading the source | |
| 7 | `session.ts`, part 2: writing the source, agent activity | |
| 8 | Save names (`saveAllSessions`, `lastSave`, `saveFailed`), `pendingMutations`, server README | |
| 9 | Browser, part 1: `lib/client/collab/`, `useCollabConnection`, `useCollabTicket` | after tdraier's editor PRs |
| 10 | Browser, part 2: `DocumentEditor`, `CollabEditor`, `CollabParticipant`... | after tdraier's editor PRs |

Later, each with its own behavior risk: the hooks as session operations, the editor model in
`lib/editor/document/`, splitting `DocumentComments.ts` and `useDocumentComments.ts`.

Docs (`ONBOARDING.md`, `LIVE_SESSION.md`, contracts) move with each PR that renames what they cite.

## On the test branch

`co-edition-architecture` (one commit per step, tests, type checks, lint and i18n green):

- Done: the vocabulary (types, functions, files, error codes `collab_session_conflict` and
  `collab_session_write_refused`, contract slugs, save names); `front/lib/api/collab/` as above;
  `front-api/lib/collab/` split into `hocuspocus.ts`, `session.ts`, `connection_access.ts` with a
  README; `lib/api/documents/`; `types/collab_internal.ts`; the browser's `lib/client/collab/`,
  `useCollabConnection`, `useCollabTicket`, `DocumentEditor`/`CollabEditor`.
- Not done:
  - The hooks still change the session's fields themselves (through `getSession`); turning them
    into session operations is a refactor with behavior risk, for its own PRs.
  - The editor model stays in `components/editor/document/`: its TipTap schema is built from the
    UI extensions, so moving it means first splitting each extension's schema from its view.
  - Splitting `DocumentComments.ts` and `useDocumentComments.ts`, and the test files along the new
    modules (`hocuspocus.test.ts` still covers `session.ts` and `connection_access.ts`).
  - Prose: comments and contract texts still say "live document" or "live session" in places;
    `CollabFileError` beside `CollabAccessError`; the `Dfm*Error` class names in
    `lib/api/documents/`.
