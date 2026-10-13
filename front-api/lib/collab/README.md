# The collab server

The collab server (front-collab) is one Node process, started by `front-api/collab_server.ts` and
built from front-api's code. On one port it serves browsers' WebSockets through Hocuspocus
(`/api/collab`) and front's internal HTTP calls (`/internal`).

It is transport: the business logic it calls (access checks, Markdown and Yjs conversions, comment
logic, loading and saving files) lives in `front/lib/api/collab/`.

| File | What it does |
|---|---|
| `hocuspocus.ts` | Builds Hocuspocus and its hooks: connect, load, change, save, unload. Parses and answers browsers' comment messages. Saves every session on shutdown (`saveAllSessions`). |
| `session.ts` | What the server holds for each open file (`CollabSession`), and reading and writing its source for front. |
| `connection_access.ts` | Who may stay connected: checked when a browser connects, then every 5 minutes. |
| `internal_routes.ts` | The HTTP routes only front can call (agent tools, file uploads), built by `createInternalRoutes`. They call `session.ts`. |
| `collab_access_errors.ts` | `CollabAccessError` to HTTP errors, for any route. |

Words, used the same way in code, contracts and docs (`x/daph/co-edition/ARCHITECTURE.md`):
co-edition is the feature, collab the code, and the UI says "live". A **file** is the `.md` in
storage, its **source** its Markdown, a **session** what this server holds for an open file, a
**connection** a browser's WebSocket, **access** a user's right to use a file here, and to **save**
is to write a session back to its file.
