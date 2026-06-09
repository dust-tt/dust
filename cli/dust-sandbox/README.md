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
```

## Build

```sh
cd cli/dust-sandbox
cargo build
./target/debug/dsbx --help
```
