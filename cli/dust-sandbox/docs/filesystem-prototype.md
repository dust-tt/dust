# Sandbox filesystem prototype

## What this proves

The sandbox sees one mounted filesystem with two folders:

```text
/files/conversation/
/files/pod/
```

A file has a number that does not change when its name or folder changes. Dust
can attach a `FileResource` ID to that number. The path tells us where the file
is now; it is not the file's identity.

This first version stores the file list in SQLite and stores file contents in a
local data folder. That lets us test the filesystem rules without giving a
sandbox PostgreSQL or GCS credentials. Replacing those two local pieces with a
Dust API and signed GCS requests comes later.

## Cases that must work

Each case is run through normal filesystem commands after mounting the daemon.

1. **Create and read**
   - `echo hello > /files/conversation/note.txt`
   - Reading the path returns `hello`.
   - The SQLite row and content file both exist.

2. **Write again**
   - Writing new bytes to `note.txt` keeps its file number.
   - Reading returns the new bytes.

3. **Rename in one folder**
   - Rename `conversation/note.txt` to `conversation/renamed.txt`.
   - The old path disappears and the new path has the same file number.

4. **Move between conversation and pod**
   - Move `conversation/renamed.txt` to `pod/renamed.txt`.
   - This is one rename, not copy then delete.
   - The file number and attached `FileResource` ID stay the same.

5. **Delete**
   - Delete `pod/renamed.txt`.
   - The path and content file disappear.
   - A delete record keeps the file number and `FileResource` ID so Front can
     delete the matching product object.

6. **Editor save**
   - An editor writes `note.txt.tmp`, then renames it over `note.txt`.
   - Linux replaces the destination file number with the temporary file's
     number. We follow that normal rule.
   - If `note.txt` has a `FileResource` ID and the temporary file does not, that
     `FileResource` ID moves onto the new file number. The shared Frame survives
     even though its underlying file was replaced.

7. **Restart**
   - Stop and restart the daemon with the same data folder.
   - Paths, file numbers, attached `FileResource` IDs, and bytes remain.

8. **Folders**
   - Create, list, rename, and remove empty folders below either root.
   - Moving a folder between `conversation` and `pod` keeps the numbers of the
     folder and every child.

## Deliberate limits

This prototype has one writer: one daemon using one SQLite file. It does not yet
support hard links, user-created symbolic links, file locks, extended
attributes, special files, or several sandboxes writing the same tree.

Renaming one shared file over another shared file returns an error. Silently
choosing which `FileResource` survives would be dangerous.

The local content folder is not the production storage design. In production,
the daemon should ask Front for file operations and use short-lived signed GCS
requests for bytes. The sandbox must not receive database or bucket credentials.

## Small command surface

```text
dsbx filesystem mount --mountpoint /files --state-dir /run/dust-files
dsbx filesystem show --state-dir /run/dust-files conversation/note.txt
dsbx filesystem attach --state-dir /run/dust-files \
  conversation/note.txt --file-resource-id fil_123
dsbx filesystem changes --state-dir /run/dust-files
```

`show`, `attach`, and `changes` exist for this prototype's tests and inspection.
They make identity changes visible without opening SQLite by hand.

## Code map

- `store.rs` creates file numbers, keeps paths in SQLite, and keeps bytes in
  `state-dir/content/<file-number>`.
- `fuse.rs` translates Linux file calls into `store.rs` calls. Reads and writes
  go directly to the local content file.
- `attach.rs`, `show.rs`, and `changes.rs` are small inspection commands.
- `tests/filesystem_fuse_acceptance.sh` runs every case above through a real
  Linux mount.

## What must change before production

The SQLite file and local content folder are a working stand-in, not shared
storage. The next version needs a Front service with the same operations. Front
must save a move or delete before reporting success, and it must finish or retry
the matching GCS work after a crash.

The local prototype can leave a content file and SQLite row out of sync if the
machine dies in the middle of create, replace, or delete. A production service
needs a saved operation record and a retry worker for those cases.

Reads currently copy through the FUSE process because that is the normal FUSE
interface. We should test kernel passthrough for local cached files before
moving large-file workloads to this design.

To run the real-mount test after building a Linux binary:

```text
sudo DSBX_BINARY=./target/release/dsbx \
  ./tests/filesystem_fuse_acceptance.sh
```
