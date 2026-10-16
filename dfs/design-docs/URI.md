# dfs:// URI proposal

This document proposes how clients such as front reference dfs objects. Persistent references are
object IDs. Paths are a transient input, always resolved under an object ID, and never stored.

## Principles

- An object is identified only by its `ObjectId`. IDs stay stable across renames and moves; paths do
  not.
- Clients store object IDs, never paths. Front stores the IDs of the folders it owns, such as a user's,
  a pod's or a conversation's folder, and the IDs of the files it needs to reference.
- A path is only valid relative to an anchor object ID. There are no absolute paths. The stored
  tenant root ID is an anchor like any other, but clients only use it to create and recover user
  folders (see [Folder layout](#folder-layout)).
- Names in URIs are decorative. They help humans and models read a URI and never take part in
  resolution.

## Grammar

```text
uri       = "dfs://" anchor [ "/" path ]
anchor    = [ name "--" ] object-id
object-id = 32 lowercase hexadecimal characters   // UUIDv7, as in DfsObjectId.
name      = 1*( unreserved | pct-encoded )
path      = segment *( "/" segment )
segment   = 1*( unreserved | pct-encoded )
unreserved  = ALPHA | DIGIT | "-" | "." | "_" | "~"
pct-encoded = "%" HEXDIG HEXDIG
```

Examples:

```text
dfs://0190c3a0b1c27d4e8f0a1b2c3d4e5f60
dfs://plan.md--0190c3a0b1c27d4e8f0a1b2c3d4e5f60
dfs://pod-acme--0190c3a0b1c27d4e8f0a1b2c3d4e5f60/data/plan.md
dfs://0190c3a0b1c27d4e8f0a1b2c3d4e5f60/reports/q3%20summary.md
```

- The object ID follows the last `--` of the anchor. A name may contain `--`.
- An empty name (`dfs://--<id>`) is invalid. To omit the name, omit the `--`.
- Each decoded segment is a stored basename: 1–255 UTF-8 bytes, without `/` or NUL, and not `.` or
  `..`. Empty segments, leading or trailing slashes, query strings and fragments are invalid.
- The anchor's name is decoded and ignored. Segment names are decoded and resolved.
- A URI without a path is canonical. A URI with a path is a request, valid only for the call that
  uses it.

## Resolution

1. Parse the anchor's object ID and ignore its name.
2. With no path, the target is the anchor object.
3. With a path, walk the segments from the anchor with `Lookup`, one segment at a time. Each
   intermediate object must be a directory.

Resolution uses the caller's session and grants. Naming an anchor grants no access: every `Lookup`
needs `r` on the parent, and the target operation needs its usual permission. A segment that is
missing or inaccessible fails with `NOT_FOUND`. Walking through a file fails with `NOT_DIRECTORY`.

Resolution is not atomic across segments. A concurrent rename or move can make a walk fail with
`NOT_FOUND`, or reach the object now at that path. Callers that need a specific object must use its
ID.

The walk runs client-side on top of the existing API: one `Lookup` round trip per segment. Paths are
expected to be short, typically up to three segments. A server-side resolve can be added later if
needed. It does not change this format.

## Operations

| Operation | Without path | With path |
| --- | --- | --- |
| Read, write, stat, list, delete | Acts on the anchor. | Walks the URI's path from the anchor, then acts on the object it reaches. |
| Create | Creates nothing at the anchor. A name is required. | Walks the URI's path from the anchor, except the last segment, which names the new object. |

When creating, missing intermediate directories under the anchor are created one level at a time,
like `mkdir -p`. A directory that already exists, including one created concurrently (`create`
fails with `ALREADY_EXISTS`), is looked up and reused; an existing file there fails with
`NOT_DIRECTORY`. A failure partway leaves the directories already created in place. An existing
object at the last segment fails with `ALREADY_EXISTS`, as `create` does.

The client returns the resolved or created object's canonical URI, `dfs://<name>--<id>` with its
current name percent-encoded and no path. That URI is built from the returned `Attr`. Clients store the ID it
contains, never the URI they passed in.

Writes keep the file's object ID. Content that fits in one `Apply` is written atomically in that
`Apply`. Larger content is written by creating or truncating the file, then writing it chunk by
chunk: this is not atomic, and readers can see partial content until the last chunk is written.
Multi-chunk reads compare each chunk's `content_version` and fail instead of mixing two versions.
`Attr` does not expose an object's parent, so the usual atomic replacement (upload to a temporary
sibling, then rename it over the target) is not possible for a URI without a path.
`move` requires source and destination paths to resolve both parent IDs; canonical URIs alone are
insufficient. `remove` likewise requires a path to resolve the object's parent.

## Example: front and a pod

1. When a pod is created, front creates its folder under its owner's user folder (see
   [Folder layout](#folder-layout)) and stores the folder's ID on the pod.
2. An agent writes a plan into the pod:

   ```text
   create dfs://pod-acme--<pod-folder-id>/data/plan.md
   ```

   The client creates `data/` if needed, then `plan.md`, and returns `dfs://plan.md--<plan-id>`.
3. If front needs to keep a reference to that file, such as an attachment or an agent output, it
   stores `<plan-id>`, not `data/plan.md`.
4. A later edit uses `dfs://plan.md--<plan-id>`. It still targets the same file after a user renames
   it or moves it to another folder of the pod. The stale `plan.md` name in the URI is ignored.

Conversations work the same way, with the conversation's folder ID as the anchor.

## Folder layout

`CreateTenant` returns the stored tenant root's real `ObjectId`; front stores it as
`dfs_tenants.rootId`. Front chooses the parent of each context's folder. Today everything lives
under its owner's user folder:

```text
<tenant-root>/
  users/
    <userSId>/
      pods/
        pod-<podSId>/
      conversations/
        conv-<conversationSId>/
```

Only user folders are created from the tenant root. Pod and conversation folders are created from
their owner's user folder ID, which front already stores:

```text
create dfs://<tenant-root-id>/users/<userSId>
create dfs://<userSId>--<user-folder-id>/pods/pod-<podSId>
create dfs://<userSId>--<user-folder-id>/conversations/conv-<conversationSId>
```

- **Layout:** namespace folders (`users/`, `pods/`, `conversations/`) keep listings small and leave
  room for grants per namespace. They are created the first time they are needed, like any missing
  intermediate directory.
- **Stored reference:** front stores the returned folder ID on the user, the pod, or the
  conversation. All later access to that context's content uses this ID as the anchor, never a path
  from the root or from the user folder.
- **Moves:** this layout reflects ownership today and may change, for instance when a pod is shared
  or transferred. Moving a folder keeps its object ID, so references front stores stay valid.
- **User folders:** a user's folder holds their personal data in this workspace. The tenant is the
  workspace, so a user who belongs to several workspaces has one folder per workspace, and its ID is
  stored per user and workspace, not on the global user. Deleting a user's folder deletes the pods
  and conversations it contains.
- **Names:** user folders are named after the user's sId, like pod and conversation folders. An sId
  never changes, so folders never need renaming, and it needs no percent-encoding in URIs. Two
  contexts can therefore never claim the same name.
- **Retries:** `Apply` has no idempotency key, so a lost response leaves the outcome unknown. A
  retry that fails with `ALREADY_EXISTS` looks the name up under the same parent folder and uses the
  existing folder's ID. This recovery is the only case where front resolves an existing context
  folder by name.
- **Access:** creating these folders requires a session with `w` on their parent folder. User and
  agent sessions only receive grants on the context folders they work in. Each context folder is
  where that context's grants attach: sharing a pod means granting access on its folder.

## Virtual references

The API's virtual `root` and `shared` references are out of scope for now. URIs only name real
object IDs, and clients do not use these references. The sandbox FUSE mount does not use them
either: its root is synthesized by the FUSE client (see [Sandbox paths](#sandbox-paths)). If a use
case appears, we will specify how they map to URIs.

## Sandbox paths

Agents run code in sandboxes where dfs is mounted through FUSE. Each sandbox has a single FUSE
mount, with one session, whose root lists symlinks to the folders the sandbox works in:

```text
/mnt/dfs/
  conversation -> conv-<conversationSId>--<conversation-folder-id>
  pod          -> pod-<podSId>--<pod-folder-id>
```

- Front builds the symlinks from the IDs it stores. The FUSE client resolves a
  `<name>--<object-id>` target like a URI anchor, then walks the rest of the path from it.
- The session's grants are the only access restriction; the symlinks are for navigation.
- Sandbox paths MUST NOT be persisted. A resolved path is directly a URI:
  `/mnt/dfs/conv-<conversationSId>--<id>/out.csv` is `dfs://conv-<conversationSId>--<id>/out.csv`.
  Front resolves it with its own session and stores the resulting object ID.

The mount path, symlink names and implementation details are still to be decided.

## Open questions

- **Atomic large writes:** without the parent, a client cannot replace a large file atomically
  through its ID. This needs a server-side mechanism, for instance staging content in a temporary
  object and swapping it into the target in one operation that keeps the target's object ID.
