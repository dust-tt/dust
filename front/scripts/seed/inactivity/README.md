# Inactivity Seed

Seeds a workspace whose answer to "which agents would automatic archival take?" is known in advance,
so the preview endpoint can be checked by hand.

## What it creates

Five agents. At a 30-day threshold, two are archivable and the other three are each spared by a
different rule:

| Agent | Setup | At 30 days |
| --- | --- | --- |
| `Idle Agent` | created 90d ago, never mentioned | **eligible** |
| `Recently Used Agent` | created 90d ago, mentioned yesterday | not a candidate |
| `Scheduled Agent` | created 90d ago, unmentioned, enabled schedule | `active_schedule` |
| `Fresh Agent` | created today, never mentioned | `recent_creation` |
| `Edited Agent` | first version 90d ago, edited today, unmentioned | **eligible** |

## Prerequisites

- `dust-hive` seed must have run, for the workspace and its admin.
- Temporal must be reachable: creating the enabled schedule starts a workflow. Its cron is yearly, so
  the seeded agent will not actually run.

## Usage

```bash
npx tsx scripts/seed/inactivity/seed.ts --execute
```

The seed also enables the `archive_inactive_agents` feature flag on the workspace.

To target a different workspace:

```bash
DEV_WORKSPACE_SID=MyWorkspace npx tsx scripts/seed/inactivity/seed.ts --execute
```

Idempotent: re-running skips the agents, the mention conversation, the trigger and the edit.
