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

```sh
cd cli/dust-sandbox
cargo build
./target/debug/dsbx --help
```

## Functions

Functions are self-contained Bun bundles in `$DUST_FUNCTIONS_DIR`, named
`<name>.ts`. `dsbx` executes them via an embedded runner (`bun` required).

- `dsbx function run <name>` — request envelope JSON on stdin → response JSON
  on stdout (`{ok, response}` / `{ok:false, error}`).
- `dsbx function get <name>` — prints `{name, description, input_schema,
  output_schema}` (JSON Schema).

The embedded runner is committed at `functions-runner/runner.js`; regenerate it
after changing the runner sources with `cd functions-runner && bun run build`.
