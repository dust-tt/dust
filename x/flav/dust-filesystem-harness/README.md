# Dust filesystem harness

Mounts the sandbox filesystem daemon on a developer machine, so a change can be
tried against a real kernel mount without a sandbox, without Front and without
cloud storage.

The acceptance script that ships with the sandbox expects all three of those, so
it can only run after a deploy. This harness gives it a mount to run against in a
container instead, and it is how the startup crash and the stale file times were
found: both were invisible in review and in the unit tests, and both appeared the
first time the daemon actually served a mount.

## Running it

On a Mac, one command per script. It builds the image, builds the daemon for
Linux into a volume, and mounts inside the container:

```sh
x/flav/dust-filesystem-harness/run.sh mount_checks.sh
```

The daemon embeds a generated bundle, so if the build stops for a missing runner,
build that first:

```sh
(cd cli/dust-sandbox/functions-runner && bun install && bun run build)
```

Pass `RELEASE=1` to test an optimised daemon, which is what sandboxes run. This
matters more than it looks: some checks inside our dependencies only exist in
plain builds, so the two profiles do not always behave the same way.

On a Linux machine that has `/dev/fuse`, skip the wrapper and run a script
directly as root after building the daemon:

```sh
cargo build --manifest-path cli/dust-sandbox/Cargo.toml --bin dsbx
sudo x/flav/dust-filesystem-harness/mount_checks.sh
```

`DAEMON`, `MOUNTPOINT`, `STAGING_DIR` and `TOKEN_FILE` override the defaults.

## What each script does

`acceptance.sh` runs the acceptance script that ships with the sandbox, unchanged
and end to end.

`mount_checks.sh` checks the parts of a filesystem that are easy to get wrong:
the two short root paths being real links with their own identity, writing
through them, times and owners a caller asks for, one writer at a time, and a
file keeping its identity across a move between roots.

`staging_checks.sh` mounts several times over to check what startup does with the
local staging directory: a fresh one, one it already claimed, one left mid-claim
by a crash, and one belonging to something else that must be left untouched.

`time_probe.sh` prints the time a file reports after each step of a write, then
checks that it stops moving once the file is saved. A time that settles late is
what makes tar and rsync report that a file changed while they read it.

`space_probe.sh` prints what `stat` and `du` report for files of known sizes,
which catches reporting allocated space in the wrong unit.

## The stand-in Front

`fake_front.py` answers the sandbox filesystem API from memory and keeps file
contents in a dictionary. It stands in for Front and for cloud storage at once:
the upload and download addresses it hands out point back at itself. It is a test
double rather than a second implementation of the contract, so it stays only as
capable as these scripts need.

It keeps no record of past requests, so retrying a create, a rename or a delete
is not covered here. It serves one sandbox, so nothing here covers two sandboxes
sharing a Pod. It never fails a request, so the retry and error paths stay with
the Rust tests.
