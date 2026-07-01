# dust-sandbox — Dust Sandbox CLI

A CLI for interacting with Dust from within sandboxes.

## Authentication

`dust-sandbox` authenticates using short-lived sandbox JWT tokens:

- Token is minted per `SandboxResource.exec()` call
- JWT claims: `{wId, cId, uId, sbId}`
- Injected as the `DUST_SANDBOX_TOKEN` environment variable with a 2-minute TTL
- The API authenticates tokens via the `sbt-` prefix branch in `withPublicAPIAuthentication`
- Builds a scoped `Authenticator` with `isSandboxToken: true`

## Commands

```
dsbx version       Print version information
dsbx forward       Forward sandbox egress traffic to the Dust egress proxy
dsbx resolve       Run the local synthetic DNS resolver for proxied traffic
dsbx healthcheck   Report sandbox egress enforcement health as JSON
dsbx tools         Interact with MCP servers and tools
dsbx function      Run a sandbox function (run) or print its schema (get)
```

## Build

The functions runner bundle (`functions-runner/runner.js`) is a generated
artifact and is **not committed**. Build it once before compiling `dsbx`:

```sh
cd cli/dust-sandbox/functions-runner
bun install
bun run build
```

Then build the CLI:

```sh
cd cli/dust-sandbox
cargo build
./target/debug/dsbx --help
```

(If the bundle is missing, `build.rs` fails the build with this instruction.)

## Functions

Functions are self-contained Bun bundles in `$DUST_FUNCTIONS_DIR`, named
`<name>.ts`. `dsbx` executes them via an embedded runner (`bun` required).

- `dsbx function run <name>` — request envelope JSON on stdin → response JSON
  on stdout (`{ok, response}` / `{ok:false, error}`).
- `dsbx function get <name>` — prints `{name, description, input_schema,
  output_schema}` (JSON Schema).

### Unprivileged execution

Function code is untrusted, so the `bun` child (runner harness + bundle) runs as
the sandbox's unprivileged, egress-proxied `agent-proxied` user (uid `1003` —
the `skuid` enforced by `dsbx healthcheck`), not as whoever launched `dsbx`.
This is automatic and needs no flags: when `dsbx` is invoked as root (e.g. by
the sandbox resource), it downgrades the child to that user before exec — its
primary group and supplementary groups are looked up at runtime (the user's
group is `agent`, not `1003`), so the function gets the same network containment
(egress proxy: domain allowlisting + DSEC secret substitution) and group-based
file access (`/files` etc.) as agent code.

`dsbx` itself may stay root: it chowns the runner and stages the bundle into a
temp dir owned by the agent user, so the dropped child can read both even when
the originals are root-only. When `dsbx` runs unprivileged (local dev), there is
nothing to contain and no privilege to `setuid`, so the child runs as the
current user.

The runner is bundled (Zod inlined) into `functions-runner/runner.js`, a
generated artifact that is **not committed** (it is `.gitignore`d). `dsbx`
embeds it via `include_str!`, so it must be built with `bun run build` before
compiling `dsbx`; `build.rs` fails early with instructions if it is missing. CI,
the release workflow, and `upsert_dsbx_to_sandbox.sh` build it on the host
first. Rebuild it after changing any runner source (`protocol.ts`, `invoke.ts`,
`schema.ts`, `runner.ts`).
