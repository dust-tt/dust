# dfs:// versions and timestamps

This document is the source of truth for which versions and timestamps of a file or directory each
operation updates. [API.md](API.md#shared-types) defines the `attr_version`, `content_version`, and
`grants_version` fields.

## Choices

Every choice below has been agreed on. When discussing one, refer to it by its number.

1. **Timestamps.** Two kinds of change set `mtime` and `ctime`:
   - a file's bytes or size change;
   - a directory's list of children changes: a child is created, removed, renamed, moved in or
     out, or replaced. Editing a child's bytes or attributes does not change the list.

   Any other attribute change sets `ctime` only.
2. **Reads never set `atime`.** Only creation and an explicit update do. Setting it on reads would
   advance `attr_version` on every read.
3. **No check against the current value.** An update is never compared with what is stored: it
   counts as a change even when nothing differs. Writing identical bytes, setting an xattr to its
   current value, renaming to the current name, or setting `size` to the current size all advance
   the versions. Checks can be added later without breaking clients, since versions may skip values.
4. **A zero-length write counts as a write.** It advances `content_version` like any other write.
5. **One advance per operation.** An `Apply` with several operations on the same object advances
   its versions once per operation, not once for the whole request.
6. **Creation** sets `atime`, `mtime`, and `ctime` to the creation time.
7. **An explicit `atime` or `mtime` update** stores the given value and also sets `ctime`.
8. **Versions start at 1** when an object is created.
9. **`attr_version` advances whenever a stored attribute changes:** size, timestamps, MIME type,
   xattrs, the object's name, or its parent. The version fields themselves do not count. With
   choice 1, writes and entry changes therefore always advance `attr_version` as well as
   `content_version`.
10. **A file's `content_version` advances on every write and every size change**, truncation and
    extension included. Metadata changes, renames, and moves leave it unchanged.
11. **A directory's `content_version` advances when its list of children changes.** Editing a
    child's bytes or attributes, or renaming or moving the directory itself, leaves it unchanged.
12. **A rename or move** advances the object's `attr_version` and the `content_version` of each
    parent involved.
13. **A grant change on an object advances only its `grants_version`.** It never updates
    `attr_version`, `content_version`, or timestamps. A grant change on an ancestor updates nothing
    on the object, even when it changes the object's mode or which entries a session sees.
14. **Reads never update anything.** Reading, listing, stat'ing, looking up, or fetching metadata
    leaves every version and timestamp unchanged.
15. **Virtual projections.** Virtual `root` reports the stored tenant root's versions and
    timestamps. Virtual `shared` has no timestamps, and all its versions stay at 1.
16. **One `grants_version` advance per `UpdateGrants` request**, however many grants it attaches or
    detaches. Following choice 3, it advances even when every change is a no-op. Transaction receipts
    prevent another advance on retry after an unknown commit result.

## Legend

✅ yes, should be updated · ❌ no, should stay the same.

## Directories

| Operation | attr_version | content_version | grants_version | atime | mtime | ctime |
| --- | --- | --- | --- | --- | --- | --- |
| Created (empty or not) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| A child is created, removed, renamed, moved in or out, or replaced | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| A child's contents, attributes, grants, or descendants change | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Renamed or moved | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Metadata update: xattrs, MIME type, `atime`, `mtime` | ✅ | ❌ | ❌ | ✅ if set | ✅ if set | ✅ |
| A grant on it changes | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| A grant on an ancestor changes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Listed, stat'd, or looked up | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

## Files

| Operation | attr_version | content_version | grants_version | atime | mtime | ctime |
| --- | --- | --- | --- | --- | --- | --- |
| Created | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Write: any offset or size, identical bytes, append, or zero-length | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Truncated or extended via `size` | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Metadata update: xattrs, MIME type, `atime`, `mtime` | ✅ | ❌ | ❌ | ✅ if set | ✅ if set | ✅ |
| Read | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Renamed or moved | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| A grant on it changes | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| A grant on an ancestor changes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Its parent or a sibling changes | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
