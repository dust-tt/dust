---
name: dust-hive
description: Use whenever the working directory is in a registered dust-hive worktree, or when managing dust-hive environments, services, ports, dependency links, or local tests.
---

# dust-hive

dust-hive runs multiple isolated Dust development environments. Each registered environment has
its own Git worktree, port range, Docker containers, databases, and service processes.

## Find the environment

Hive-owned worktrees normally live at `<repo>/.hives/<name>`. Worktrees registered with
`dust-hive adopt` may live elsewhere under the main repository root, and older environments may
still use `~/dust-hive/<name>`. Do not identify a Hive environment from its path alone.

Use the CLI and registered metadata instead:

```bash
dust-hive list
dust-hive status [ENV_NAME]
```

Per-environment metadata, generated environment variables, logs, and process IDs live under
`~/.dust-hive/envs/<name>/`.

## Environment states

| State | What is running | Tests |
| --- | --- | --- |
| `stopped` | Nothing | No |
| `cold` | SDK and Sparkle watchers | Front and front-api tests can use the shared test services |
| `warm` | Cold services, Docker, and the main application services | Yes |

`viz` and `storybook` are opt-in services; they are not started by `warm`.

Common lifecycle commands:

```bash
dust-hive start [ENV_NAME]   # Start the cold services
dust-hive warm [ENV_NAME]    # Start Docker and the main application services
dust-hive cool [ENV_NAME]    # Return to the cold state
dust-hive stop [ENV_NAME]    # Stop the environment
dust-hive open [ENV_NAME]    # Open its terminal session
```

Use `dust-hive spawn` to create a Hive-owned worktree and `dust-hive adopt` to register an
existing externally managed worktree. Do not manually create or switch worktrees for Hive-owned
environments. Run `destroy` or `unregister` only when the user explicitly requests it.

## Services and logs

Current service names are:

```text
sdk, sparkle, front-api, marketing, proxy, core, oauth, connectors, front-workers,
front-spa-poke, front-spa-app, viz, storybook
```

Use a concrete service name with `logs`:

```bash
dust-hive logs [ENV_NAME] front-api
dust-hive logs [ENV_NAME] front-spa-app -f
```

For `restart`, `front` is an alias for `front-api`, `front-workers`, `front-spa-poke`, and
`front-spa-app`:

```bash
dust-hive restart [ENV_NAME] front
dust-hive restart [ENV_NAME] storybook
```

OAuth is a binary in the `core` Rust crate, not a separate `oauth/` workspace.

## Ports and forwarding

Each environment receives a 1000-port range. The first starts at 10000, the second at 11000, and
so on. Prefer `dust-hive status [ENV_NAME]` and `dust-hive url [ENV_NAME]` over hard-coding its
allocated ports.

When forwarding is enabled, the standard development ports map to the selected environment:

| Port | Service |
| --- | --- |
| 3000 | Public proxy |
| 3001 | Core |
| 3002 | Connectors |
| 3006 | OAuth |
| 3007 | Viz |
| 3010 | Poke SPA |
| 3011 | Main SPA |
| 6006 | Storybook |

`dust-hive warm` normally starts forwarding unless passed `--no-forward`, but it does not change
forwarding when the environment is already warm. Use `dust-hive forward [ENV_NAME]` to switch
explicitly. Before switching, run `dust-hive forward status`. If another environment owns the
standard ports, ask the user before changing it.

## Checks and tests

Use the applicable workspace `AGENTS.md`, `CODING_RULES.md`, and `package.json` scripts. The web
application is split across the `front` library, the Hono `front-api` service, and the Vite
`front-spa` applications. Current focused checks include:

```bash
npm run format:changed
npm -w front run tsgo -- --noEmit
npm -w front-api run tsgo -- --noEmit
npm -w front-spa run tsgo -- --noEmit
npm -w connectors run build
cd core && cargo check && cargo clippy
```

For dust-hive itself, run `bun run check` from `x/henry/dust-hive`.

The shared test Postgres and Redis services are started by `dust-hive up` and listen on ports 5433
and 6479. Each Hive gets its own front test database. The generated environment exports
`TEST_FRONT_DATABASE_URI` and `TEST_REDIS_URI`, and the workspace test scripts apply them:

```bash
cd front && npm run test -- path/to/test.test.ts
cd front-api && npm run test -- path/to/test.test.ts
```

Front tests can run in a cold environment; warming the full application is unnecessary.

## Dependencies and generated configuration

Do not run `npm install` directly in a Hive worktree. Run `dust-hive sync` from a clean main branch
in the main repository to pull changes, update root dependencies, rebuild cached Rust binaries, and
refresh the installed dust-hive command. Then use this command to restore an environment's
dependency links and copy current local agent configuration:

```bash
dust-hive refresh [ENV_NAME]
```

After a rebase or another Git operation that changes the SDK without triggering its watcher,
restart it with `dust-hive restart [ENV_NAME] sdk`.

When documentation and behavior disagree, use `dust-hive --help` for commands and inspect
`x/henry/dust-hive/src/lib/services.ts`, `x/henry/dust-hive/src/lib/registry.ts`, and
`x/henry/dust-hive/src/lib/ports.ts` for the current service and port definitions.
