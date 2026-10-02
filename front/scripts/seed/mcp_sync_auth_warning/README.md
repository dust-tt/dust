# MCP Sync Auth Warning Seed

Creates two fake remote MCP servers stuck in the sync-auth-expired state so you
can exercise the Tools admin warning UX (list warning icon, Synchronization
banner, Authentication Warning chip, More info tooltips, Refresh).

These are not real NetSuite servers. The URLs intentionally fail OAuth discovery
so Refresh uses the stored-authorization fallback.

## Created Fixtures

| Server                           | Use case           | Tooltip                                                    |
| -------------------------------- | ------------------ | ---------------------------------------------------------- |
| `NetSuite Sync Warning`          | `platform_actions` | Shared auth must be refreshed; agents cannot use the tools |
| `NetSuite Sync Warning Personal` | `personal_actions` | Setup/sync auth expired; personal agent auth unaffected    |

Each server also gets:

- OAuth authorization metadata (`provider: "mcp"`)
- A workspace connection (so Authentication shows connected / Warning)
- `lastError` + a past `lastSyncAt` (so Synchronization shows the warning banner)

## Usage

```bash
npx tsx scripts/seed/mcp_sync_auth_warning/seed.ts --execute
```

To target a different workspace:

```bash
DEV_WORKSPACE_SID=MyWorkspace npx tsx scripts/seed/mcp_sync_auth_warning/seed.ts --execute
```

With dust-hive:

```bash
dust-hive warm <env>
dust-hive feed <env> mcp_sync_auth_warning
```

Idempotent: re-running reuses servers by name and forces them back into the
warning state.

## Where to look

1. Open Tools admin (`/w/<workspace>/spaces/<space>/tools` or the Admin Tools list).
2. Find `NetSuite Sync Warning` — warning icon on the row.
3. Open it — Synchronization banner + Authentication Warning / Refresh / More info.
4. Open `NetSuite Sync Warning Personal` to compare the personal tooltip.
