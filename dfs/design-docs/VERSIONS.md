# dfs:// versions and timestamps

This document lists, for each operation, which versions and timestamps of a file or directory it
updates. [API.md](API.md#shared-types) defines `attr_version` and `content_version`, but does not
say which timestamps each operation updates, or what happens when a request sets a value the
object already has.

**This is a first draft, to be agreed on by the team and updated later as needed.** It favours
simple rules over precise ones, so that the server, the clients, and the mount all rely on the
same behaviour.

## Choices

API.md does not settle these points, so we need an answer for each before implementing the
remaining operations. When reviewing, refer to a choice by its number.

1. **Timestamps.** Two kinds of change set `mtime` and `ctime`:
   - a file's bytes or size change;
   - a directory's list of children changes: a child is created, removed, renamed, moved in or
     out, or replaced. Editing a child's bytes or attributes does not change the list.

   Any other attribute change sets `ctime` only.
2. **Reads never set `atime`.** Only creation and an explicit update do. Setting it on reads would
   advance `attr_version` on every read.
3. **No check against the current value.** An update is never compared with what is stored: it
   counts as a change even when nothing differs. Setting an xattr to its current value, renaming
   to the current name, or setting `size` to the current size all advance the versions. Checks can
   be added later without breaking clients, since versions may skip values.
4. **A zero-length write counts as a write.** It advances `content_version` like any other write.
5. **One advance per operation.** An `Apply` with several operations on the same object advances
   its versions once per operation, not once for the whole request.
6. **Creation** sets `atime`, `mtime`, and `ctime` to the creation time.
7. **An explicit `atime` or `mtime` update** stores the given value and also sets `ctime`.

API.md already requires that every timestamp change advance `attr_version`. With choice 1, writes
and entry changes therefore always advance `attr_version` as well as `content_version`.

## Legend

🟢 advances, inferred from documentation · 🟩 advances, proposed here ·
🔴 unchanged, inferred from documentation · 🟥 unchanged, proposed here.

## Directories

| Operation | attr_version | content_version | atime | mtime | ctime |
| --- | --- | --- | --- | --- | --- |
| Created (empty or not) | 🟢 | 🟢 | 🟩 | 🟩 | 🟩 |
| A child is created, removed, renamed, moved in or out, or replaced | 🟢 | 🟢 | 🟥 | 🟩 | 🟩 |
| A child's contents, attributes, or descendants change | 🟥 | 🔴 | 🟥 | 🟥 | 🟥 |
| Renamed or moved | 🟢 | 🔴 | 🟥 | 🟥 | 🟩 |
| Metadata update: xattrs, MIME type, `atime`, `mtime` | 🟢 | 🔴 | 🟢 if set | 🟢 if set | 🟩 |
| A grant on it or an ancestor changes | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Listed, stat'd, or looked up | 🟥 | 🔴 | 🟥 | 🟥 | 🟥 |

## Files

| Operation | attr_version | content_version | atime | mtime | ctime |
| --- | --- | --- | --- | --- | --- |
| Created | 🟢 | 🟢 | 🟩 | 🟩 | 🟩 |
| Write: any offset or size, identical bytes, append, or zero-length | 🟩 | 🟢 | 🟥 | 🟩 | 🟩 |
| Truncated or extended via `size` | 🟢 | 🟢 | 🟥 | 🟩 | 🟩 |
| Metadata update: xattrs, MIME type, `atime`, `mtime` | 🟢 | 🔴 | 🟢 if set | 🟢 if set | 🟩 |
| Read | 🟥 | 🔴 | 🟥 | 🟥 | 🟥 |
| Renamed or moved | 🟢 | 🔴 | 🟥 | 🟥 | 🟩 |
| A grant on it or an ancestor changes | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Its parent or a sibling changes | 🟥 | 🔴 | 🟥 | 🟥 | 🟥 |

