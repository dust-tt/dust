# Agent File Systems

## Current State

Dust agents interact with files through four systems:

| File System | Scope | Storage | Agent Access | Sandbox Access |
|---|---|---|---|---|
| **Conversation Files** | Single conversation | GCS | MCP (`conversation_files`) + gcsfuse | `/files/conversation` |
| **Project Files** | All conversations in project | GCS + Core | MCP (`project_manager` + `conversation_files`) | Not mounted |
| **Data Source Files** | Workspace (per data source) | Core API | MCP (`data_sources_file_system`) | Not mounted |
| **Sandbox Files** | Single conversation | E2B container | `sandbox` bash tool | Direct filesystem |

### How conversation file mounting works today

Files are stored in GCS at a canonical path (`files/w/{wId}/{fileId}/original`) and *copied* to a
mount path (`w/{wId}/conversations/{cId}/files/{fileName}`). The mount path is what gcsfuse
exposes at `/files/conversation` inside the sandbox.

The mount sequence in `front/lib/api/sandbox/gcs/mount.ts`:
1. Mint a downscoped GCS token via Google STS, scoped to the conversation prefix.
2. Write token to `/tmp/token.json` in the sandbox.
3. Start a netcat-based token HTTP server on `:9876`.
4. Run gcsfuse with `--only-dir {prefix}` and `--token-url http://127.0.0.1:9876`.

Project files have **no mount path** - there is an explicit TODO in
`file_resource.ts:resolveAndSetMountFilePath()`:
```
// TODO(2026-03-09 SANDBOX): Add support for project context.
```

### How file MCP tools work today

**`conversation_files` server** (auto-added when conversation has attachments):
- `list` - List files attached to conversation (+ project files if in project context).
- `cat` - Read file contents with offset/limit/grep.
- `semantic_search` - Semantic search within file contents.

**`project_manager` server** (auto-added for project conversations):
- `add_file` / `update_file` - Create or replace project files.
- `edit_description` / `get_information` / `list_unread` - Non-file project operations.

---

## Target State

### Design principle

The sandbox filesystem is the only interface for agents to read/write conversation and project
files. No MCP tools for file listing, reading, or writing. Agents use standard Unix tools
(`ls`, `cat`, `grep`, `head`, etc.) via the `sandbox` bash tool.

### Generic mount system

Instead of hardcoding a single gcsfuse mount, the sandbox supports a **configurable list of
mounts**. Each mount maps a GCS prefix to a path inside the sandbox.

```typescript
interface SandboxMount {
  gcsPrefix: string;   // GCS path prefix (e.g. "w/{wId}/conversations/{cId}/files/")
  mountPoint: string;  // Sandbox path (e.g. "/files/conversation")
  readOnly?: boolean;
}
```

By default, a sandbox gets:

| Mount Point | GCS Prefix | Read/Write |
|---|---|---|
| `/files/conversation` | `w/{wId}/conversations/{cId}/files/` | read/write |
| `/files/project` | `w/{wId}/spaces/{spaceId}/files/` | read/write |

The project mount is only added when the conversation belongs to a project.

### Multiple gcsfuse instances

Each mount runs its own gcsfuse process with its own downscoped token. This keeps token scoping
tight - each token only grants access to its specific prefix. The token server approach needs to
support multiple tokens (one per mount), either via multiple ports or a path-keyed single server.

### Target overview

| File System | Scope | Storage | Agent Access | Sandbox Access |
|---|---|---|---|---|
| **Conversation Files** | Single conversation | GCS | Filesystem only | `/files/conversation` (gcsfuse) |
| **Project Files** | All conversations in project | GCS | Filesystem only | `/files/project` (gcsfuse) |
| **Data Source Files** | Workspace (per data source) | Core API | MCP (`data_sources_file_system`) | Not mounted |
| **Sandbox Files** | Single conversation | E2B container | `sandbox` bash tool | Direct filesystem |

```
User uploads file ──> GCS ──> gcsfuse ──> /files/conversation
Project file added ──> GCS ──> gcsfuse ──> /files/project
Data source synced ──> Core API ──> data_sources_file_system MCP (unchanged)
Agent runs code ──> Sandbox local fs (ephemeral) + /files/* (persistent)
```

---

## What Needs to Change

### 1. GCS path scheme for project files

**Where:** `front/lib/api/files/mount_path.ts`

Add path helpers for project files, parallel to conversation helpers:
```
w/{workspaceId}/spaces/{spaceId}/files/{fileName}
```

**Where:** `front/lib/resources/file_resource.ts` (`resolveAndSetMountFilePath`)

Implement the TODO: resolve mount paths for `project_context` use case using `useCaseMetadata.spaceId`.

### 2. Generic mount configuration

**Where:** `front/lib/api/sandbox/gcs/mount.ts`

Refactor `mountConversationFiles()` into a generic `mountGcsFolder()` that takes a `SandboxMount`
config. The current function becomes one caller of the generic version.

Add a higher-level function that takes a list of `SandboxMount` configs and mounts them all
(sequentially or in parallel).

**Where:** `front/lib/api/sandbox/gcs/token.ts`

No changes needed - `mintDownscopedGcsToken()` already accepts an arbitrary `{ bucket, prefix }`.
Each mount gets its own call.

### 3. Token server: support multiple mounts

**Where:** Sandbox base image (`token-server.sh`) + `mount.ts`

The current token server serves a single `/tmp/token.json` on `:9876`. With multiple mounts,
options include:
- **Multiple token files + multiple ports** - each gcsfuse gets `--token-url` pointing to its own
  port. Simplest, minimal changes to the netcat script.
- **Single server with path routing** - more elegant but requires replacing the netcat script.

Recommend multiple ports for simplicity. Each mount gets port `9876 + index`.

### 4. Mount orchestration at sandbox creation

**Where:** `front/lib/resources/sandbox_resource.ts` (`ensureActive`)

Currently calls `mountConversationFiles` or `refreshGcsToken` depending on sandbox state. Refactor
to:
1. Build the list of `SandboxMount` configs from context (conversation ID, project space ID if any).
2. For fresh/woken sandboxes: mount all.
3. For running sandboxes: refresh all tokens.

### 5. Project file upload: write to mount path

**Where:** `front/lib/resources/file_resource.ts`

When a project file is created or updated, it must be copied to the mount path in GCS (same as
conversation files already do). This makes it appear in the gcsfuse mount.

### 6. Remove `conversation_files` MCP server

**Remove:**
- `front/lib/api/actions/servers/conversation_files/` - Server implementation.
- Entry in `front/lib/actions/mcp_internal_actions/constants.ts` (id=17).
- Case in `front/lib/actions/mcp_internal_actions/servers/index.ts`.

**Remove:**
- `front/lib/api/assistant/jit/conversation.ts` (`getConversationFilesServer()`).
- References in `front/lib/api/assistant/jit_actions.ts`.

**Clean up:**
- `front/lib/resources/mcp_server_view_resource.ts` - auto-tool view creation for this server.
- `front/lib/actions/mcp_internal_actions/instructions.ts` - references to conversation file tools.
- Migration to clean up any stored `MCPServerViewModel` records referencing this server.

### 7. Trim `project_manager` MCP server

**Where:** `front/lib/api/actions/servers/project_manager/`

Remove file-access tools (`add_file`, `update_file`) from the server. Keep non-file tools:
- `edit_description` - still needed, no filesystem equivalent.
- `get_information` - project metadata (URL, description). Could keep or replace with a file
  at `/files/project/.dust/project.json`.
- `list_unread` - conversation listing, no filesystem equivalent.

### 8. Sandbox base image

**Where:** `front/lib/api/sandbox/image/registry.ts` + E2B template

Ensure `/files/project` directory exists with appropriate permissions (like `/files/conversation`
already does). If using multiple token server ports, update `token-server.sh` or add additional
instances.

### 9. Instructions / prompts

**Where:** Agent system prompts and instructions

Update any instructions that reference `conversation_files` tools or `project_manager` file tools
to instead tell the agent to use the filesystem at `/files/conversation` and `/files/project`.

Key files:
- `front/lib/actions/mcp_internal_actions/instructions.ts`
- `front/lib/api/assistant/project_kickoff.ts` (references `project_manager.add_file`)
- Any skill definitions that mention these tools.

---

## What Does NOT Change

- **Data source files** - Still accessed via `data_sources_file_system` MCP tools. These come from
  external integrations (Google Drive, Notion, etc.) and live in the Core API, not GCS.
- **Sandbox lifecycle** - Sleep/wake/destroy via the reaper remains the same.
- **File upload API** - Frontend upload flow to GCS stays the same. The mount path copy step
  just needs to also handle project files.
- **Canonical GCS storage** - Files still stored at `files/w/{wId}/{fileId}/original`. The mount
  path is a separate copy at a human-readable location.

---

## Open Questions

1. **Should project files be read-only from the sandbox?** Conversation files are read/write
   (agent can create output files). Project files are shared across conversations - should agents
   be able to write to `/files/project` directly, or should writes go through an API to maintain
   indexing into the Core data source?

2. **Semantic search** - Dropping the MCP `semantic_search` tool means agents can only `grep`
   conversation/project files. Is this acceptable? Alternatively, semantic search could remain
   available through the `data_sources_file_system` server if conversation/project files are
   indexed as data sources.

3. **Backward compatibility** - Existing agent configurations may reference `conversation_files`
   tools. Need a migration path (likely: remove the server, JIT logic stops adding it, stored
   views become orphaned and get cleaned up).
