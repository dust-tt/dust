# dfs:// URI proposal

This document proposes how clients such as front reference dfs objects. Persistent references are
object IDs. Paths are a transient input, always resolved under an object ID, and never stored.

## Principles

- An object is identified only by its `ObjectId`. IDs stay stable across renames and moves; paths do
  not.
- Clients store object IDs, never paths. Front stores the IDs of the folders it owns, such as a pod's,
  a conversation's or a user's top folder, and the IDs of the files it needs to reference.
- A path is only valid relative to an anchor object ID. There are no absolute paths. The stored
  tenant root ID is an anchor like any other, but clients only use it to create and recover
  top-level folders (see [Top-level folders](#top-level-folders)).
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
| Read, write, stat, list, delete | Acts on the anchor. | Resolves the full path, then acts on the target. |
| Create | Creates nothing at the anchor. A name is required. | Resolves the parent path; the last segment is the new object's name. |

When creating, missing intermediate directories under the anchor are created, like `mkdir -p`. The
client resolves the longest existing prefix of the path. It then sends one `Apply` that creates the
missing directories and the new object, using the object IDs it generated. An existing object at the
last segment fails with `ALREADY_EXISTS`, as `create` does.

The client returns the resolved or created object's canonical URI, `dfs://<name>--<id>` with its
current name percent-encoded and no path. That URI is built from the returned `Attr`. Clients store the ID it
contains, never the URI they passed in.

## Example: front and a pod

1. When a pod is created, front creates its top folder under the tenant root (see
   [Top-level folders](#top-level-folders)) and stores the folder's ID on the pod.
2. An agent writes a plan into the pod:

   ```text
   create dfs://pod-acme--<pod-folder-id>/data/plan.md
   ```

   The client creates `data/` if needed, then `plan.md`, and returns `dfs://plan.md--<plan-id>`.
3. If front needs to keep a reference to that file, such as an attachment or an agent output, it
   stores `<plan-id>`, not `data/plan.md`.
4. A later edit uses `dfs://plan.md--<plan-id>`. It still targets the same file after a user renames
   it or moves it to another folder of the pod. The stale `plan.md` name in the URI is ignored.

Conversations work the same way, with the conversation's top folder ID as the anchor.

## Top-level folders

`CreateTenant` returns the stored tenant root's real `ObjectId`; front stores it as
`dfs_tenants.rootId`. Front creates each context's top folder under that root, in a namespace folder:

```text
create dfs://<tenant-root-id>/pods/pod-<podSId>
create dfs://<tenant-root-id>/conversations/conv-<conversationSId>
create dfs://<tenant-root-id>/users/user-<userSId>
```

- **Layout:** namespace folders (`pods/`, `conversations/`, `users/`) keep the root's listing small
  and leave room for grants per namespace. They are created the first time they are needed, like any
  missing intermediate directory.
- **Stored reference:** front stores the returned folder ID on the pod, the conversation, or the
  user. All later access to that context's content uses this ID as the anchor, never a path from
  the root.
- **User folders:** a user's folder holds their personal data in this workspace. The tenant is the
  workspace, so a user who belongs to several workspaces has one folder per workspace, and its ID is
  stored per user and workspace, not on the global user.
- **Names:** top folder names derive from the owning resource's sId, which is unique and never
  changes. Two contexts can therefore never claim the same name.
- **Retries:** `Apply` has no idempotency key, so a lost response leaves the outcome unknown. A
  retry that fails with `ALREADY_EXISTS` looks the name up under its namespace folder and uses the
  existing folder's ID. This recovery is the only case where front resolves existing content
  through the root.
- **Access:** creating top folders requires a session with `w` on the root or on the namespace
  folder. User and agent sessions only receive grants on the context folders they work in. Each top
  folder is where that context's grants attach.

## Virtual references

The API's virtual `root` and `shared` references are out of scope for now. URIs only name real
object IDs, and clients do not use these references. If a use case appears, we will specify how
they map to URIs.

## Sandbox paths

Agents run code in sandboxes that mount dfs through FUSE. Code and shells only understand absolute
paths, such as `cat /conversation/data.csv` or `python script.py > /pod/out.md`. A sandbox therefore
maps mount points to anchor IDs when it starts:

```text
sandbox for conversation C, in pod P:
  /conversation → <C's folder id>
  /pod          → <P's folder id>
```

- The mapping is runtime configuration, not stored data. It is built from the IDs front already
  stores, each time a sandbox starts.
- It is local to one sandbox. `/conversation/out.csv` points to a different object in another
  conversation's sandbox, so sandbox paths MUST NOT be persisted or passed outside the sandbox as
  references.
- A sandbox path translates directly into a URI: `/pod/out.md` becomes
  `dfs://<P's folder id>/out.md`. When front needs to keep a file produced in a sandbox, it resolves
  that URI once and stores the resulting object ID.
- Mounting an anchor grants no access. The sandbox's session grants still apply to every object
  under each mount point.

## Open questions

- **Display paths:** `Attr` exposes no parent, so a client cannot build a path such as
  `pod/data/plan.md` from an ID alone. For now, UIs only show paths they walked down to themselves.
  A server "ancestors of an object" call would be needed for more.
- **Who owns sandbox mounts:** the mount-point mapping can be passed to the FUSE mount when it
  starts, which needs no server change. Later, it could be declared on the dfs session as virtual
  mounts, so every client of that session sees the same view. That would bring the virtual `root`
  back in scope.
